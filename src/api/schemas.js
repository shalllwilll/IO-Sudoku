// Zod schemas for responses the UI reads. They follow backend/docs/openapi.json.
// Objects are loose so the backend may add fields. A mismatch fails with a
// ValidationError that names the field, never a broken screen.
import { z } from "zod";
import { ValidationError } from "./errors.js";
import { PLACEMENT_KIND, RUN_STATUS, TQ_SEVERITY } from "./live/wire.js";

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
  status: z.enum(Object.values(RUN_STATUS)),
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
      kind: z.enum(Object.values(PLACEMENT_KIND)),
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
    kpi: loose({
      cabinets: z.number().int(),
      ciocs: z.number().int(),
      signals_total: z.number().int(),
      spares: loose({
        cabinets: z.array(loose({ cabinet: z.string(), empty_baseplates: z.number().int(), free_slots_on_used_baseplates: z.number().int(), required_empty_baseplates: z.number().int(), wired_spare_pairs: z.number().int() })),
        by_controller_io: z.array(loose({ controller: z.string(), io_type: z.string(), field_signals: z.number().int(), required: z.number().int(), wired_spares: z.number().int() })),
      }),
    }),
    declaration: loose({ rule_set: z.string() }),
    rules: z.array(
      loose({ rule: z.string(), description: z.string(), passed: z.boolean(), violations: z.number().int(), enforced: z.boolean().optional(), strength: z.string().optional() }),
    ),
  }),
});

export const TqSchema = loose({
  id: z.string(),
  code: z.string(),
  category: z.string(),
  severity: z.enum(TQ_SEVERITY),
  status: z.string(),
  message: z.string(),
  subject: z.string(),
  signal_keys: z.array(z.string()).optional(),
  options: z.array(loose({ label: z.string(), consequence: z.string() })).optional(),
});

export const TqListSchema = z.array(TqSchema);
export const RunListSchema = z.array(RunSchema);
export const ProjectListSchema = z.array(ProjectSchema);
export const UploadListSchema = z.array(UploadSchema);
const DeltaSchema = loose({
  tag: z.string().nullable(),
  cable: z.string().nullable().optional(),
  pair: z.number().int().nullable().optional(),
  old_slot: z.string().nullable().optional(),
  new_slot: z.string().nullable().optional(),
  fields: z.array(z.string()).optional(),
});

const ImpactDetailSchema = loose({
  label: z.string(),
  baseline_label: z.string(),
  added: z.number().int().optional(),
  removed: z.number().int().optional(),
  modified: z.number().int().optional(),
  moved: z.number().int().optional(),
  unchanged: z.number().int().optional(),
  total_baseline: z.number().int().optional(),
  total_revised: z.number().int().optional(),
  solver: z.string().optional(),
  moves_by_reason: z.record(z.number().int()).optional(),
  // Mock-only convenience field (docs/contract-gaps.md): the real Impact model has no
  // naive-reallocation figure. Optional so a real backend response still validates.
  naive_moved: z.number().int().optional(),
});

export const ChainSchema = z.array(
  loose({
    seq: z.number().int(),
    label: z.string(),
    parent_label: z.string().nullable(),
    run_id: z.string(),
    created_at: z.string().optional(),
    impact: ImpactDetailSchema.nullable().optional(),
  }),
);
export const ChainEntrySchema = ChainSchema.element;
export const ComparisonSchema = loose({
  from_label: z.string(),
  to_label: z.string(),
  added: z.number().int(),
  removed: z.number().int(),
  moved: z.number().int(),
  modified: z.number().int().optional(),
  unchanged: z.number().int(),
  naive_moved: z.number().int().optional(),
  deltas: z.array(DeltaSchema).optional(),
});
export const ImpactSchema = loose({
  run_id: z.string().optional(),
  available: z.boolean(),
  impact: ImpactDetailSchema.nullable().optional(),
  diff: z.array(DeltaSchema).optional(),
  reason: z.string().nullable().optional(),
});
export const BaselineSchema = loose({
  chain_run_id: z.string(),
  label: z.string(),
  placed: z.number().int(),
  signals: z.number().int(),
});
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
