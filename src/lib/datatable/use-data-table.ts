"use client";

import { useCallback, useMemo, useState } from "react";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { listQueryToSearchParams, type CursorPage, type ListQuery } from "./types";

export interface SortState {
  id: string;
  dir: "asc" | "desc";
}

export interface UseDataTableOptions {
  /** List endpoint returning the jsonOk envelope of CursorPage<T>. */
  endpoint: string;
  pageSize?: number;
  defaultSort: SortState;
  initialFilters?: Record<string, string>;
}

interface ApiEnvelope<T> {
  ok: boolean;
  data?: CursorPage<T>;
  error?: string;
}

/**
 * All DataTable state: debounced keyword search, filters, sort, keyset-cursor
 * paging (a cursor stack gives Previous without reverse queries or COUNT(*)),
 * row selection, and the TanStack Query fetch. Changing search/filters/sort
 * resets to page one; `keepPreviousData` keeps rows painted while the next
 * page streams in.
 */
export function useDataTable<T>({
  endpoint,
  pageSize = 25,
  defaultSort,
  initialFilters = {},
}: UseDataTableOptions) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search.trim(), 300);
  const [filters, setFiltersState] = useState<Record<string, string>>(initialFilters);
  const [sort, setSortState] = useState<SortState>(defaultSort);
  // cursorStack[i] = cursor that loads page i+2; current page = stack depth + 1.
  const [cursorStack, setCursorStack] = useState<string[]>([]);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());

  const cursor = cursorStack[cursorStack.length - 1] ?? null;

  const listQuery: ListQuery = useMemo(
    () => ({
      q: debouncedSearch || undefined,
      sort: sort.id,
      dir: sort.dir,
      cursor: cursor ?? undefined,
      limit: pageSize,
      filters,
    }),
    [debouncedSearch, sort, cursor, pageSize, filters],
  );

  const query = useQuery({
    queryKey: [endpoint, listQuery],
    placeholderData: keepPreviousData,
    queryFn: async ({ signal }): Promise<CursorPage<T>> => {
      const params = listQueryToSearchParams(listQuery);
      const res = await fetch(`${endpoint}?${params}`, { signal });
      const body = (await res.json()) as ApiEnvelope<T>;
      if (!res.ok || !body.ok || !body.data) {
        throw new Error(body.error ?? `Request failed (${res.status})`);
      }
      return body.data;
    },
  });

  const resetPaging = useCallback(() => {
    setCursorStack([]);
    setSelected(new Set());
  }, []);

  const onSearchChange = useCallback(
    (value: string) => {
      setSearch(value);
      resetPaging();
    },
    [resetPaging],
  );

  const setFilter = useCallback(
    (id: string, value: string) => {
      setFiltersState((prev) => {
        const next = { ...prev };
        if (value === "") delete next[id];
        else next[id] = value;
        return next;
      });
      resetPaging();
    },
    [resetPaging],
  );

  const clearFilters = useCallback(() => {
    setFiltersState({});
    setSearch("");
    resetPaging();
  }, [resetPaging]);

  const toggleSort = useCallback(
    (id: string) => {
      setSortState((prev) =>
        prev.id === id
          ? { id, dir: prev.dir === "asc" ? "desc" : "asc" }
          : { id, dir: "desc" },
      );
      resetPaging();
    },
    [resetPaging],
  );

  const nextPage = useCallback(() => {
    const nextCursor = query.data?.nextCursor;
    if (nextCursor) setCursorStack((prev) => [...prev, nextCursor]);
  }, [query.data?.nextCursor]);

  const prevPage = useCallback(() => {
    setCursorStack((prev) => prev.slice(0, -1));
  }, []);

  const toggleSelected = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const setPageSelected = useCallback((ids: string[], on: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (on) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => setSelected(new Set()), []);

  const refresh = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: [endpoint] });
  }, [queryClient, endpoint]);

  /** Current query string (minus cursor/limit) — feeds export & print URLs. */
  const exportParams = useMemo(() => {
    const params = listQueryToSearchParams({
      q: debouncedSearch || undefined,
      sort: sort.id,
      dir: sort.dir,
      filters,
    });
    return params;
  }, [debouncedSearch, sort, filters]);

  return {
    rows: query.data?.rows ?? [],
    estimatedTotal: query.data?.estimatedTotal ?? null,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    error: query.error instanceof Error ? query.error.message : null,
    page: cursorStack.length + 1,
    hasNext: Boolean(query.data?.nextCursor),
    hasPrev: cursorStack.length > 0,
    nextPage,
    prevPage,
    search,
    onSearchChange,
    filters,
    setFilter,
    clearFilters,
    sort,
    toggleSort,
    selected,
    toggleSelected,
    setPageSelected,
    clearSelection,
    refresh,
    exportParams,
    pageSize,
  };
}

export type DataTableState<T> = ReturnType<typeof useDataTable<T>>;
