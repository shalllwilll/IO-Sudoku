/** Every backend error is `{code, message, details}`; network failures use the code `network`. */
export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly details: unknown

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.details = details
  }
}

/** Plain-language text for the codes the backend documents. Unknown codes fall back to the server message. */
const TEXT: Record<string, string> = {
  network: 'Cannot reach the backend. Check that it is running and that the address in Settings is right.',
  not_found: 'That item no longer exists.',
  validation_error: 'Some of the values are not valid.',
  empty_file: 'The file is empty.',
  unreadable_workbook: 'That workbook could not be read. Check that it is a valid .xlsx file.',
  file_too_large: 'The file is larger than the server accepts.',
  unsupported_media_type: 'Only .xlsx workbooks are accepted.',
  not_xlsx: 'Only .xlsx workbooks are accepted.',
  no_uploads: 'Upload a workbook before running.',
  run_not_finished: 'That run has not finished yet.',
  not_an_initial_run: 'Only an initial run can become a baseline.',
  baseline_exists: 'This project already has a baseline.',
  revision_exists: 'That revision label is already used.',
  output_unavailable: 'The allocation workbook was not produced for this run.',
  unknown_revision: 'That revision does not exist.',
  invalid_mapping: 'The mapping refers to a column or field that does not exist.',
  invalid_value: 'That value is not allowed for this field.',
  invalid_rules: 'The rules are not valid.',
  invalid_answer: 'That answer is not valid for this question.',
  not_an_allocation: 'That file is not an allocation workbook.',
}

export function describeError(error: unknown): string {
  if (error instanceof ApiError) return TEXT[error.code] ?? error.message
  if (error instanceof Error) return error.message
  return 'Something went wrong.'
}

export const isNetworkError = (e: unknown): boolean => e instanceof ApiError && e.code === 'network'

/** Build an ApiError from a failed response body, tolerating bodies that are not the expected shape. */
export function fromResponse(status: number, body: unknown): ApiError {
  if (body && typeof body === 'object') {
    const b = body as { code?: unknown; message?: unknown; details?: unknown }
    if (typeof b.code === 'string') {
      return new ApiError(status, b.code, typeof b.message === 'string' ? b.message : b.code, b.details)
    }
  }
  return new ApiError(status, 'http_error', `The server answered ${status}.`, body)
}
