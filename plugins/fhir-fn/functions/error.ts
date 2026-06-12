// @ts-nocheck - Deno edge function
type Kind = "not-found" | "invalid" | "conflict" | "deleted" | "exception" | "timeout";

const STATUS: Record<Kind, number> = {
  "not-found": 404, "invalid": 400, "conflict": 409,
  "deleted": 410, "exception": 500, "timeout": 408,
};

export class FhirError extends Error {
  constructor(public readonly code: Kind, public readonly diagnostics: string) {
    super(diagnostics);
  }
  get status(): number { return STATUS[this.code]; }

  static notFound(m: string) { return new FhirError("not-found", m); }
  static badRequest(m: string) { return new FhirError("invalid", m); }
  static conflict(m: string) { return new FhirError("conflict", m); }
  static gone(m: string) { return new FhirError("deleted", m); }
  static internal(m: string) { return new FhirError("exception", m); }
  static timeout(m: string) { return new FhirError("timeout", m); }

  operationOutcome() {
    return {
      resourceType: "OperationOutcome",
      issue: [{ severity: "error", code: this.code, diagnostics: this.diagnostics }],
    };
  }
  toResponse(): Response {
    return new Response(JSON.stringify(this.operationOutcome()), {
      status: this.status,
      headers: { "content-type": "application/fhir+json" },
    });
  }
}
