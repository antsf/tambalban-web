import { z } from "zod";

export const INDONESIA_BOUNDS = {
  minLat: -11.0,
  maxLat: 6.0,
  minLng: 95.0,
  maxLng: 141.0,
} as const;

function isInsideIndonesia(lat: number, lon: number): boolean {
  return (
    lat >= INDONESIA_BOUNDS.minLat &&
    lat <= INDONESIA_BOUNDS.maxLat &&
    lon >= INDONESIA_BOUNDS.minLng &&
    lon <= INDONESIA_BOUNDS.maxLng
  );
}

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === "" ? undefined : v))
    .optional();

export const submissionSchema = z
  .object({
    name: z.string().trim().min(2, "Nama minimal 2 karakter").max(200),
    lat: z.coerce.number("Latitude harus berupa angka"),
    lon: z.coerce.number("Longitude harus berupa angka"),
    address: optionalText(500),
    city: optionalText(100),
    province: optionalText(100),
    district: optionalText(100),
    phone: optionalText(30),
    whatsapp: optionalText(30),
    website: optionalText(200),
    instagram: optionalText(100),
    opening_hours: optionalText(100),
    image_url: optionalText(500),
    motorcycle_tyres: z.coerce.boolean().optional().default(false),
    car_tyres: z.coerce.boolean().optional().default(false),
    truck_tyres: z.coerce.boolean().optional().default(false),
    tubeless_repair: z.coerce.boolean().optional().default(false),
    vulcanizer: z.coerce.boolean().optional().default(false),
    balancing: z.coerce.boolean().optional().default(false),
    spooring: z.coerce.boolean().optional().default(false),
    roadside_service: z.coerce.boolean().optional().default(false),
  })
  .refine((v) => isInsideIndonesia(v.lat, v.lon), {
    message: "Lokasi di luar batas wilayah Indonesia",
    path: ["lat"],
  });

export type SubmissionInput = z.infer<typeof submissionSchema>;

export const loginSchema = z.object({
  email: z.string().trim().email("Email tidak valid").max(254),
  password: z.string().min(8, "Password minimal 8 karakter").max(200),
});

export const geocodeSchema = z.object({
  q: z.string().trim().min(3, "Pencarian minimal 3 karakter").max(200),
});

export const adminLoginSchema = z.object({
  password: z.string().min(1).max(200),
});

export const adminDataQuerySchema = z.object({
  search: z.string().trim().max(200).optional(),
  verified: z.enum(["true", "false"]).optional(),
  source: z.enum(["user", "osm"]).optional(),
  limit: z.coerce.number().int().min(1).max(500).optional().default(100),
  offset: z.coerce.number().int().min(0).optional().default(0),
});

export const adminUsersQuerySchema = z.object({
  search: z.string().trim().max(200).optional(),
});

export const adminReviewsQuerySchema = z.object({
  rating: z.coerce.number().int().min(1).max(5).optional(),
  limit: z.coerce.number().int().min(1).max(500).optional().default(200),
});

export const bboxSchema = z
  .object({
    search: z.string().trim().max(200).optional(),
    minLat: z.coerce.number().optional(),
    maxLat: z.coerce.number().optional(),
    minLng: z.coerce.number().optional(),
    maxLng: z.coerce.number().optional(),
  })
  .refine(
    (v) =>
      v.minLat === undefined || v.maxLat === undefined || v.minLat <= v.maxLat,
    { message: "minLat > maxLat" },
  );
