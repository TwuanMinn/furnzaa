import { z } from "zod";

/**
 * Shared validation for the feedback module — client forms + server actions.
 * Lives outside actions.ts because "use server" modules may only export async
 * functions. NO server-only imports here.
 */

export const FEEDBACK_STATUSES = ["new", "in_progress", "resolved", "reopened"] as const;
export type FeedbackStatus = (typeof FEEDBACK_STATUSES)[number];

export const FEEDBACK_SEVERITIES = ["low", "medium", "high"] as const;
export type FeedbackSeverity = (typeof FEEDBACK_SEVERITIES)[number];

/** Private "feedback" bucket policy: png/jpeg/webp, 5MB per file. */
export const FEEDBACK_PHOTO_MIME_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;
export const FEEDBACK_PHOTO_MAX_BYTES = 5 * 1024 * 1024;
export const FEEDBACK_PHOTO_MAX_COUNT = 10;

export const feedbackIdSchema = z.string().uuid("Invalid feedback record");

export const feedbackAttachmentSchema = z.object({
  /** Path inside the "feedback" bucket; must start with the uploader's auth.uid()/ (re-checked server-side). */
  path: z.string().trim().min(1, "Attachment path is required").max(500),
  name: z.string().trim().min(1, "Attachment name is required").max(255),
  mime: z
    .string()
    .trim()
    .min(1, "Attachment type is required")
    .max(100)
    .refine(
      (m: string) => (FEEDBACK_PHOTO_MIME_TYPES as readonly string[]).includes(m),
      "Photos must be PNG, JPEG, or WebP",
    ),
  size: z
    .number()
    .int()
    .positive("Attachment looks empty")
    .max(FEEDBACK_PHOTO_MAX_BYTES, "Each photo must be 5MB or smaller"),
});
export type FeedbackAttachmentInput = z.infer<typeof feedbackAttachmentSchema>;

export const createFeedbackSchema = z
  .object({
    customerId: z.string().uuid("Invalid customer").nullable().optional(),
    fallbackName: z.string().trim().max(200).optional().or(z.literal("")),
    fallbackPhone: z.string().trim().max(50).optional().or(z.literal("")),
    orderId: z.string().uuid("Invalid order").nullable().optional(),
    rating: z.number().int().min(1, "Pick a rating from 1 to 5").max(5, "Pick a rating from 1 to 5"),
    comments: z.string().trim().min(1, "Comments are required").max(5000),
    category: z.string().trim().min(1, "Pick a category").max(100),
    sourceChannel: z.string().trim().min(1, "Pick a source channel").max(100),
    severity: z.enum(FEEDBACK_SEVERITIES),
    attachments: z
      .array(feedbackAttachmentSchema)
      .max(FEEDBACK_PHOTO_MAX_COUNT, `Up to ${FEEDBACK_PHOTO_MAX_COUNT} photos`),
  })
  .refine((v) => !!v.customerId || !!v.fallbackName?.trim(), {
    message: "Pick a customer or enter the customer's name",
    path: ["customerId"],
  });
export type CreateFeedbackInput = z.infer<typeof createFeedbackSchema>;

export const updateFeedbackSchema = z.object({
  id: feedbackIdSchema,
  rating: z.number().int().min(1, "Pick a rating from 1 to 5").max(5, "Pick a rating from 1 to 5"),
  comments: z.string().trim().min(1, "Comments are required").max(5000),
  category: z.string().trim().min(1, "Pick a category").max(100),
  severity: z.enum(FEEDBACK_SEVERITIES),
  sourceChannel: z.string().trim().min(1, "Pick a source channel").max(100),
});
export type UpdateFeedbackInput = z.infer<typeof updateFeedbackSchema>;

export const assignFeedbackSchema = z.object({
  feedbackId: feedbackIdSchema,
  assigneeId: z.string().uuid("Pick a user to assign"),
});

export const resolveFeedbackSchema = z.object({
  feedbackId: feedbackIdSchema,
  resolutionNote: z
    .string()
    .trim()
    .min(3, "Write a short resolution note (at least 3 characters)")
    .max(2000),
});

export const reopenFeedbackSchema = z.object({
  feedbackId: feedbackIdSchema,
  reason: z.string().trim().min(1, "Give a reason for reopening").max(2000),
});

export const feedbackCommentSchema = z.object({
  feedbackId: feedbackIdSchema,
  body: z.string().trim().min(1, "Write a comment").max(4000),
  mentionedUserIds: z.array(z.string().uuid("Invalid mention")).max(20, "Up to 20 mentions"),
});
