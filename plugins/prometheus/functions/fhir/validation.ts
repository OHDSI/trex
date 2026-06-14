// @ts-nocheck - Deno edge function
// Port of plugins/fhir/src/fhir/validation.rs

export type IssueSeverity = "error" | "warning";

export interface ValidationIssue {
  severity: IssueSeverity;
  code: string;
  diagnostics: string;
  path: string | undefined;
}

export class ValidationResult {
  issues: ValidationIssue[];

  constructor(issues: ValidationIssue[]) {
    this.issues = issues;
  }

  // Rust: is_valid — no error-severity issues
  isValid(): boolean {
    return !this.issues.some((i) => i.severity === "error");
  }

  // Rust: to_operation_outcome
  toOperationOutcome(): Record<string, unknown> {
    const issues = this.issues.map((issue) => {
      const obj: Record<string, unknown> = {
        severity: issue.severity,
        code: issue.code,
        diagnostics: issue.diagnostics,
      };
      if (issue.path !== undefined) {
        obj["expression"] = [issue.path];
      }
      return obj;
    });
    return {
      resourceType: "OperationOutcome",
      issue: issues,
    };
  }
}

// Duck-typed registry interface (matches ResourceRegistry and test stubs)
type Registry = { isKnownResourceType(resourceType: string): boolean };

/**
 * Validate a FHIR resource for creation.
 * Port of validate_resource in validation.rs.
 */
export function validateResource(
  resource: unknown,
  expectedType: string,
  registry: Registry,
): ValidationResult {
  const issues: ValidationIssue[] = [];

  if (resource === null || typeof resource !== "object" || Array.isArray(resource)) {
    issues.push({
      severity: "error",
      code: "structure",
      diagnostics: "Resource must be a JSON object",
      path: undefined,
    });
    return new ValidationResult(issues);
  }

  const obj = resource as Record<string, unknown>;

  const resourceTypeValue = obj["resourceType"];
  if (typeof resourceTypeValue !== "string") {
    issues.push({
      severity: "error",
      code: "required",
      diagnostics: "Missing required field 'resourceType'",
      path: "resourceType",
    });
    return new ValidationResult(issues);
  }

  const resourceType = resourceTypeValue;

  if (resourceType !== expectedType) {
    issues.push({
      severity: "error",
      code: "value",
      diagnostics: `resourceType '${resourceType}' does not match endpoint type '${expectedType}'`,
      path: "resourceType",
    });
    return new ValidationResult(issues);
  }

  if (!registry.isKnownResourceType(resourceType)) {
    issues.push({
      severity: "error",
      code: "not-supported",
      diagnostics: `Unknown resource type: '${resourceType}'`,
      path: "resourceType",
    });
  }

  if ("id" in obj) {
    issues.push({
      severity: "warning",
      code: "informational",
      diagnostics: "Client-provided 'id' will be ignored; server assigns resource IDs",
      path: "id",
    });
  }

  return new ValidationResult(issues);
}

/**
 * Validate a FHIR resource for update (PUT).
 * Port of validate_resource_update in validation.rs.
 */
export function validateResourceUpdate(
  resource: unknown,
  expectedType: string,
  expectedId: string,
  registry: Registry,
): ValidationResult {
  const issues: ValidationIssue[] = [];

  if (resource === null || typeof resource !== "object" || Array.isArray(resource)) {
    issues.push({
      severity: "error",
      code: "structure",
      diagnostics: "Resource must be a JSON object",
      path: undefined,
    });
    return new ValidationResult(issues);
  }

  const obj = resource as Record<string, unknown>;

  const resourceTypeValue = obj["resourceType"];
  if (typeof resourceTypeValue !== "string") {
    issues.push({
      severity: "error",
      code: "required",
      diagnostics: "Missing required field 'resourceType'",
      path: "resourceType",
    });
    return new ValidationResult(issues);
  }

  const resourceType = resourceTypeValue;

  if (resourceType !== expectedType) {
    issues.push({
      severity: "error",
      code: "value",
      diagnostics: `resourceType '${resourceType}' does not match endpoint type '${expectedType}'`,
      path: "resourceType",
    });
    return new ValidationResult(issues);
  }

  if (!registry.isKnownResourceType(resourceType)) {
    issues.push({
      severity: "error",
      code: "not-supported",
      diagnostics: `Unknown resource type: '${resourceType}'`,
      path: "resourceType",
    });
  }

  const idValue = obj["id"];
  if (typeof idValue === "string") {
    if (idValue !== expectedId) {
      issues.push({
        severity: "error",
        code: "value",
        diagnostics: `Resource id '${idValue}' does not match URL id '${expectedId}'`,
        path: "id",
      });
    }
  }

  return new ValidationResult(issues);
}
