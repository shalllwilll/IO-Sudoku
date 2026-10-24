// Zod schemas for responses the UI reads. They follow backend/docs/openapi.json.
// Objects are loose so the backend may add fields. A mismatch fails with a
// ValidationError that names the field, never a broken screen.
import { z } from "zod";
import { ValidationError } from "./errors.js";

const loose = (shape) => z.object(shape).passthrough();

export const ProjectSchema = loose({
  id: z.string(),
  name: z.string(),
  created_at: z.string(),
  runs: z.number().int(),
  uploads: z.number().int(),
});

export const UploadSchema = loose({
  id: z.string(),
  name: z.string(),
  size: z.number().int(),
  sheets: z.array(loose({ sheet: z.string().nullable(), rows: z.number().int(), columns: z.array(z.string()) })),
});

export const RunSchema = loose({
  id: z.string(),
  project_id: z.string(),
  status: z.string(),
  created_at: z.string(),
});

export const MappingSchema = loose({
  fields: z.array(z.string()),
  required: z.array(z.string()),
  confirmed: z.record(z.any()),
  sheets: z.array(
    loose({
      file: z.string(),
      sheet: z.string().nullable(),
      columns: z.array(z.string()),
      matches: z.record(z.any()),
    }),
  ),
});

export const ValuesSchema = loose({
  allowed: z.record(z.any()),
  overrides: z.record(z.any()),
  unknown: z.array(loose({ field: z.string(), value: z.string(), count: z.number().int() })),
});

export const RulesSchema = loose({
  preset: z.string(),
  presets: z.array(z.string()),
  custom: z.boolean(),
  rules: z.array(loose({ id: z.string(), name: z.string(), enabled: z.boolean(), parameters: z.record(z.any()) })),
});

export const LintSchema = loose({
  findings: z.array(loose({ rule_id: z.string(), severity: z.string(), message: z.string() })),
});

export const RulePreviewSchema = loose({
  status: z.string(),
  message: z.string(),
  applied: z.boolean(),
  rule: z.record(z.any()).nullable(),
});

export const AllocationSchema = loose({
  run_id: z.string(),
  placements: z.array(
    loose({
      cioc_no: z.number().int(),
      baseplate: z.number().int(),
      channel: z.number().int(),
      kind: z.string(),
    }),
  ),
  unplaced: z.array(z.any()),
});

export const LayoutSchema = loose({
  run_id: z.string(),
  layout: loose({
    cabinets: z.array(loose({ no: z.number().int(), name: z.string(), ciocs: z.array(z.number().int()) })),
    ciocs: z.array(
      loose({
        no: z.number().int(),
        name: z.string(),
        cabinet: z.number().int(),
        baseplates: z.array(loose({ n: z.number().int(), name: z.string() })),
      }),
    ),
  }),
});

export const ReportSchema = loose({
  run_id: z.string(),
  report: loose({
    kpi: loose({ cabinets: z.number().int(), ciocs: z.number().int(), signals_total: z.number().int() }),
    declaration: loose({ rule_set: z.string() }),
    rules: z.array(z.any()),
  }),
});

export const TqSchema = loose({
  id: z.string(),
  code: z.string(),
  category: z.string(),
  severity: z.string(),
  status: z.string(),
  message: z.string(),
});

export const TqListSchema = z.array(TqSchema);
export const RunListSchema = z.array(RunSchema);
export const ProjectListSchema = z.array(ProjectSchema);
export const UploadListSchema = z.array(UploadSchema);
export const ChainSchema = z.array(
  loose({ seq: z.number().int(), label: z.string(), parent_label: z.string().nullable(), run_id: z.string() }),
);
export const ComparisonSchema = loose({
  from_label: z.string(),
  to_label: z.string(),
  added: z.number().int(),
  removed: z.number().int(),
  moved: z.number().int(),
  unchanged: z.number().int(),
});
export const ImpactSchema = loose({ available: z.boolean() });
export const AnswerSchema = loose({ tq: TqSchema });

/**
 * Parses data with a schema. On failure throws ValidationError naming the first bad field.
 * Only the field path is logged, never the data, so no row values reach the console.
 */
export function parseResponse(schema, data, label) {
  const result = schema.safeParse(data);
  if (result.success) return result.data;
  const field = result.error.issues[0]?.path?.join(".") || "(root)";
  console.warn(`[api] ${label}: unexpected shape at "${field}"`);
  throw new ValidationError(`Unexpected response from ${label}: field "${field}" does not match the contract.`, {
    field,
  });
}
