import { z } from "zod";

/** Indonesia bounding box — reject anything outside it at the API layer. */
export const INDONESIA_BOUNDS = {
  minLat: -11.0,
  maxLat: 6.0,
  minLng: 95.0,
  maxLng: 141.0,
} as const;

const latitude = z
  .number()
  .min(INDONESIA_BOUNDS.minLat, "Latitude di luar wilayah Indonesia")
  .max(INDONESIA_BOUNDS.maxLat, "Latitude di luar wilayah Indonesia");

const longitude = z
  .number()
  .min(INDONESIA_BOUNDS.minLng, "Longitude di luar wilayah Indonesia")
  .max(INDONESIA_BOUNDS.maxLng, "Longitude di luar wilayah Indonesia");

/** `HH:MM` 24-hour clock. */
const timeString = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Format jam harus HH:MM");

export const submissionSchema = z
  .object({
    name: z.string().trim().min(3, "Nama minimal 3 karakter").max(120),
    phone: z
      .string()
      .trim()
      .min(7, "Nomor telepon minimal 7 digit")
      .max(25)
      .regex(/^[0-9+\-\s()]+$/, "Nomor telepon hanya boleh angka dan + - ( )"),
    address: z.string().trim().min(10, "Alamat minimal 10 karakter").max(300),
    latitude,
    longitude,
    is_24h: z.boolean().default(false),
    open_time: timeString.nullable().optional(),
    close_time: timeString.nullable().optional(),
    notes: z.string().trim().max(500).nullable().optional(),
  })
  .refine((v) => v.is_24h || (v.open_time && v.close_time), {
    message: "Isi jam buka & tutup, atau centang buka 24 jam",
    path: ["open_time"],
  });

export type SubmissionInput = z.infer<typeof submissionSchema>;

export const boundsSchema = z
  .object({
    north: z.coerce.number().min(-90).max(90),
    south: z.coerce.number().min(-90).max(90),
    east: z.coerce.number().min(-180).max(180),
    west: z.coerce.number().min(-180).max(180),
  })
  .refine((b) => b.north > b.south, {
    message: "north harus lebih besar dari south",
  });

export const reviewActionSchema = z.object({
  action: z.enum(["approve", "reject"]),
});

export const loginSchema = z.object({
  password: z.string().min(1, "Password wajib diisi"),
});
