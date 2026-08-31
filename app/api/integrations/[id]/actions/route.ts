import {
  randomUUID,
} from "node:crypto";

import {
  NextResponse,
} from "next/server";

import type {
  IntegrationActionExecution,
  IntegrationActionRequest,
} from "../../../../../types/integration-action";

import {
  createIntegrationApiClient,
  getAuthenticatedIntegrationUser,
  integrationApiErrorResponse,
  parseRequestObject,
  writeIntegrationActivity,
} from "../../../../../lib/integrations/api";

import {
  getIntegrationConnectionById,
} from "../../../../../lib/integrations/database";

import {
  executeLiveIntegrationAction,
} from "../../../../../lib/integrations/live-action-execution";

import {
  createIntegrationActionFingerprint,
  createIntegrationActionPlan,
  evaluateIntegrationActionPolicy,
  executeIntegrationActionPlan,
  IntegrationActionError,
  parseIntegrationActionIdempotencyKey,
  parseIntegrationActionInput,
  parseIntegrationActionMode,
  resolveIntegrationActionCapability,
} from "../../../../../lib/integrations/external-action-adapter";

import {
  beginIntegrationActionRetry,
  claimIntegrationActionExecution,
  finishIntegrationActionExecution,
  IntegrationActionDatabaseError,
  listIntegrationActionExecutions,
  serializeIntegrationActionExecution,
} from "../../../../../lib/integrations/integration-action-database";

import {
  writeIntegrationOperationLog,
} from "../../../../../lib/integrations/observability";

import {
  verifyIntegrationOperatorApproval,
} from "../../../../../lib/integrations/operator-approval";

import {
  evaluateIntegrationRetry,
} from "../../../../../lib/integrations/retry-policy";

import {
  getIntegrationProvider,
} from "../../../../../lib/integrations/registry";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

function actionErrorResponse(
  error: unknown,
) {
  if (
    error instanceof
    IntegrationActionError
  ) {
    return NextResponse.json(
      {
        success: false,
        error:
          error.message,
        code:
          error.code,
      },
      {
        status:
          error.status,
      },
    );
  }

  if (
    error instanceof
    IntegrationActionDatabaseError
  ) {
    const conflictCodes =
      new Set([
        "INTEGRATION_ACTION_IDEMPOTENCY_CONFLICT",
        "INTEGRATION_ACTION_RETRY_NOT_ALLOWED",
        "INTEGRATION_ACTION_RETRY_NOT_DUE",
        "INTEGRATION_RETRY_BUDGET_EXHAUSTED",
      ]);

    const status =
      error.code ===
      "INTEGRATION_ACTION_EXECUTION_NOT_FOUND"
        ? 404
        : conflictCodes.has(
              error.code,
            )
          ? 409
          : 500;

    if (status === 500) {
      console.error(
        "J10 integration action database error:",
        error,
      );
    }

    return NextResponse.json(
      {
        success: false,
        error:
          status === 500
            ? "J10 NEXUS could not persist the integration action."
            : error.message,
        code:
          error.code,
      },
      {
        status,
      },
    );
  }

  return null;
}

function duplicateResponse(
  execution: IntegrationActionExecution,
  correlationId: string,
) {
  return NextResponse.json({
    success:
      execution.status ===
      "succeeded",
    accepted: true,
    duplicate: true,
    correlationId,
    execution:
      serializeIntegrationActionExecution(
        execution,
      ),
  });
}

export async function GET(
  request: Request,
  context: RouteContext,
) {
  try {
    const { id } =
      await context.params;

    const supabase =
      await createIntegrationApiClient();

    const user =
      await getAuthenticatedIntegrationUser(
        supabase,
      );

    if (!user) {
      return NextResponse.json(
        {
          success: false,
          error: "Unauthorized.",
        },
        {
          status: 401,
        },
      );
    }

    const connection =
      await getIntegrationConnectionById(
        supabase,
        user.id,
        id,
      );

    if (!connection) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Integration connection was not found.",
        },
        {
          status: 404,
        },
      );
    }

    const url =
      new URL(request.url);

    const requestedLimit =
      Number.parseInt(
        url.searchParams.get("limit") ??
        "25",
        10,
      );

    const executions =
      await listIntegrationActionExecutions(
        supabase,
        user.id,
        connection.id,
        Number.isFinite(requestedLimit)
          ? requestedLimit
          : 25,
      );

    return NextResponse.json({
      success: true,
      integrationId:
        connection.id,
      providerId:
        connection.providerId,
      executions:
        executions.map(
          serializeIntegrationActionExecution,
        ),
    });
  } catch (error) {
    const response =
      actionErrorResponse(error);

    return response ??
      integrationApiErrorResponse(
        error,
        "J10 NEXUS could not load integration action history.",
      );
  }
}

export async function POST(
  request: Request,
  context: RouteContext,
) {
  const correlationId =
    request.headers.get(
      "x-j10-request-id",
    )?.trim() ||
    randomUUID();

  try {
    const { id } =
      await context.params;

    const supabase =
      await createIntegrationApiClient();

    const user =
      await getAuthenticatedIntegrationUser(
        supabase,
      );

    if (!user) {
      return NextResponse.json(
        {
          success: false,
          error: "Unauthorized.",
        },
        {
          status: 401,
        },
      );
    }

    const body =
      parseRequestObject(
        await request.json(),
      );

    const connection =
      await getIntegrationConnectionById(
        supabase,
        user.id,
        id,
      );

    if (!connection) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Integration connection was not found.",
        },
        {
          status: 404,
        },
      );
    }

    const capability =
      resolveIntegrationActionCapability(
        connection,
        body.capabilityId,
      );

    const mode =
      parseIntegrationActionMode(
        body.mode,
      );

    const input =
      parseIntegrationActionInput(
        body.input,
      );

    const idempotencyKey =
      parseIntegrationActionIdempotencyKey(
        body.idempotencyKey,
        request.headers.get(
          "Idempotency-Key",
        ),
      );

    const actionRequest:
      IntegrationActionRequest = {
        capabilityId:
          capability.id,
        mode,
        idempotencyKey,
        input,
      };

    const policy =
      evaluateIntegrationActionPolicy(
        connection,
        capability,
        mode,
      );

    const plan =
      createIntegrationActionPlan(
        connection,
        capability,
        actionRequest,
        new URL(request.url).origin,
      );

    const fingerprint =
      createIntegrationActionFingerprint(
        connection,
        actionRequest,
      );

    const operatorApproved =
      verifyIntegrationOperatorApproval(
        body.operatorApprovalToken,
        {
          userId:
            user.id,
          connectionId:
            connection.id,
          fingerprint,
        },
      );

    const approvedDevelopmentWhatsAppTest =
      operatorApproved &&
      connection.providerId ===
        "whatsapp-business" &&
      connection.environment ===
        "development" &&
      capability.id ===
        "whatsapp.template.send" &&
      input.templateName ===
        "hello_world";

    const executionAllowed =
      policy.allowed ||
      approvedDevelopmentWhatsAppTest;

    const approvalSatisfied =
      !policy.requiresHumanApproval ||
      operatorApproved;

    const claim =
      await claimIntegrationActionExecution(
        supabase,
        {
          userId:
            user.id,
          integrationId:
            connection.id,
          providerId:
            connection.providerId,
          capabilityId:
            capability.id,
          mode,
          idempotencyKey,
          requestFingerprint:
            fingerprint,
          requiresApproval:
            policy.requiresHumanApproval,
        },
      );

    let activeExecution =
      claim.execution;

    let retrying =
      false;

    if (!claim.claimed) {
      if (
        body.retry !== true ||
        claim.execution.status !==
          "failed"
      ) {
        await writeIntegrationOperationLog(
          supabase,
          {
            userId:
              user.id,
            integrationId:
              connection.id,
            providerId:
              connection.providerId,
            source:
              "action",
            eventType:
              "integration.action.duplicate",
            severity:
              "info",
            status:
              "duplicate",
            correlationId,
            actionExecutionId:
              claim.execution.id,
            attempt:
              claim.execution.attemptCount,
            maxAttempts:
              claim.execution.maxAttempts,
            retryable:
              claim.execution.retryable,
            nextRetryAt:
              claim.execution.nextRetryAt,
            errorCode:
              claim.execution.errorCode,
            message:
              "An idempotent duplicate integration action request was returned without another execution.",
            metadata: {
              capabilityId:
                capability.id,
              mode,
            },
          },
        );

        return duplicateResponse(
          claim.execution,
          correlationId,
        );
      }

      activeExecution =
        await beginIntegrationActionRetry(
          supabase,
          user.id,
          claim.execution.id,
        );

      retrying =
        true;
    }

    await writeIntegrationOperationLog(
      supabase,
      {
        userId:
          user.id,
        integrationId:
          connection.id,
        providerId:
          connection.providerId,
        source:
          "action",
        eventType:
          retrying
            ? "integration.action.retrying"
            : "integration.action.started",
        severity:
          "info",
        status:
          retrying
            ? "retrying"
            : "started",
        correlationId,
        actionExecutionId:
          activeExecution.id,
        attempt:
          activeExecution.attemptCount,
        maxAttempts:
          activeExecution.maxAttempts,
        retryable:
          false,
        message:
          retrying
            ? "A bounded integration action retry started."
            : "An integration action execution started.",
        metadata: {
          capabilityId:
            capability.id,
          mode,
          policyCode:
            policy.code,
          operatorApproved,
        },
      },
    );

    if (
      !executionAllowed ||
      !approvalSatisfied
    ) {
      const approvalRequired =
        executionAllowed &&
        !approvalSatisfied;

      const blockedCode =
        approvalRequired
          ? "INTEGRATION_ACTION_APPROVAL_REQUIRED"
          : policy.code;

      const blockedReason =
        approvalRequired
          ? "This integration action requires explicit approval from an authenticated J10 operator before it may execute."
          : policy.reason;

      const blockedExecution =
        await finishIntegrationActionExecution(
          supabase,
          user.id,
          activeExecution.id,
          {
            status: "blocked",
            resultMetadata: {
              policyCode:
                blockedCode,
              policyDecisionCode:
                policy.code,
              policyReason:
                blockedReason,
              risk:
                policy.risk,
              operatorApproved,
              externalRequestSent:
                false,
            },
            errorCode:
              blockedCode,
            errorMessage:
              blockedReason,
          },
        );

      await writeIntegrationOperationLog(
        supabase,
        {
          userId:
            user.id,
          integrationId:
            connection.id,
          providerId:
            connection.providerId,
          source:
            "action",
          eventType:
            "integration.action.blocked",
          severity:
            "warning",
          status:
            "blocked",
          correlationId,
          actionExecutionId:
            blockedExecution.id,
          attempt:
            blockedExecution.attemptCount,
          maxAttempts:
            blockedExecution.maxAttempts,
          errorCode:
            blockedCode,
          message:
            blockedReason,
          metadata: {
            capabilityId:
              capability.id,
            mode,
            policyCode:
              policy.code,
            risk:
              policy.risk,
          },
        },
      );

      return NextResponse.json(
        {
          success: false,
          accepted: true,
          duplicate: false,
          correlationId,
          error:
            blockedReason,
          code:
            blockedCode,
          policy,
          execution:
            serializeIntegrationActionExecution(
              blockedExecution,
            ),
        },
        {
          status: 403,
        },
      );
    }

    try {
      const adapterResult =
        mode === "live"
          ? await executeLiveIntegrationAction({
              supabase,
              userId:
                user.id,
              connection,
              request:
                actionRequest,
              executionId:
                activeExecution.id,
              correlationId,
              signal:
                request.signal,
            })
          : await executeIntegrationActionPlan(
              plan,
              actionRequest,
              activeExecution.id,
            );

      if (!adapterResult.success) {
        const code =
          "INTEGRATION_ACTION_ADAPTER_FAILED";

        const message =
          "The integration action adapter did not complete successfully.";

        const retry =
          evaluateIntegrationRetry({
            domain:
              "action",
            attemptCount:
              activeExecution.attemptCount,
            maxAttempts:
              activeExecution.maxAttempts,
            errorCode:
              code,
            responseStatus:
              adapterResult.responseStatus,
          });

        const failedExecution =
          await finishIntegrationActionExecution(
            supabase,
            user.id,
            activeExecution.id,
            {
              status:
                "failed",
              responseStatus:
                adapterResult.responseStatus,
              resultMetadata: {
                ...adapterResult.metadata,
                policyCode:
                  policy.code,
                risk:
                  policy.risk,
              },
              errorCode:
                code,
              errorMessage:
                message,
              retryable:
                retry.retryable,
              nextRetryAt:
                retry.nextRetryAt,
            },
          );

        await writeIntegrationOperationLog(
          supabase,
          {
            userId:
              user.id,
            integrationId:
              connection.id,
            providerId:
              connection.providerId,
            source:
              "action",
            eventType:
              retry.retryable
                ? "integration.action.retry_scheduled"
                : "integration.action.failed",
            severity:
              retry.retryable
                ? "warning"
                : "error",
            status:
              retry.retryable
                ? "retry_scheduled"
                : retry.exhausted
                  ? "exhausted"
                  : "failed",
            correlationId,
            actionExecutionId:
              failedExecution.id,
            attempt:
              failedExecution.attemptCount,
            maxAttempts:
              failedExecution.maxAttempts,
            retryable:
              retry.retryable,
            nextRetryAt:
              retry.nextRetryAt,
            errorCode:
              code,
            message,
            metadata: {
              capabilityId:
                capability.id,
              mode,
              responseStatus:
                adapterResult.responseStatus,
              retryReasonCode:
                retry.reasonCode,
            },
          },
        );

        return NextResponse.json(
          {
            success: false,
            accepted: true,
            duplicate: false,
            correlationId,
            error:
              message,
            code,
            retry,
            policy,
            plan,
            execution:
              serializeIntegrationActionExecution(
                failedExecution,
              ),
          },
          {
            status: 502,
          },
        );
      }

      const completedExecution =
        await finishIntegrationActionExecution(
          supabase,
          user.id,
          activeExecution.id,
          {
            status:
              "succeeded",
            responseStatus:
              adapterResult.responseStatus,
            resultMetadata: {
              ...adapterResult.metadata,
              policyCode:
                policy.code,
              risk:
                policy.risk,
            },
          },
        );

      await writeIntegrationOperationLog(
        supabase,
        {
          userId:
            user.id,
          integrationId:
            connection.id,
          providerId:
            connection.providerId,
          source:
            "action",
          eventType:
            "integration.action.succeeded",
          severity:
            "info",
          status:
            "succeeded",
          correlationId,
          actionExecutionId:
            completedExecution.id,
          attempt:
            completedExecution.attemptCount,
          maxAttempts:
            completedExecution.maxAttempts,
          retryable:
            false,
          message:
            "The integration action completed successfully.",
          metadata: {
            capabilityId:
              capability.id,
            mode,
            responseStatus:
              adapterResult.responseStatus,
          },
        },
      );

      const provider =
        getIntegrationProvider(
          connection.providerId,
        );

      await writeIntegrationActivity(
        supabase,
        {
          userId:
            user.id,
          action:
            "integration_action_executed",
          entityId:
            connection.id,
          title:
            `${provider.name} action completed`,
          description:
            `${capability.name} completed in ${mode} mode.`,
          metadata: {
            execution_id:
              completedExecution.id,
            provider_id:
              connection.providerId,
            capability_id:
              capability.id,
            mode,
            source:
              "day14l_observability_retry",
          },
        },
      );

      return NextResponse.json({
        success: true,
        accepted: true,
        duplicate: false,
        correlationId,
        policy,
        operatorApproval: {
          accepted:
            operatorApproved,
          purpose:
            operatorApproved
              ? "whatsapp_test_delivery"
              : null,
        },
        plan,
        execution:
          serializeIntegrationActionExecution(
            completedExecution,
          ),
      });
    } catch (executionError) {
      const code =
        executionError instanceof
        IntegrationActionError
          ? executionError.code
          : "INTEGRATION_ACTION_EXECUTION_FAILED";

      const message =
        executionError instanceof Error
          ? executionError.message
          : "Integration action execution failed.";

      const responseStatus =
        executionError instanceof
        IntegrationActionError
          ? executionError.status
          : null;

      const retry =
        evaluateIntegrationRetry({
          domain:
            "action",
          attemptCount:
            activeExecution.attemptCount,
          maxAttempts:
            activeExecution.maxAttempts,
          errorCode:
            code,
          responseStatus,
        });

      const failedExecution =
        await finishIntegrationActionExecution(
          supabase,
          user.id,
          activeExecution.id,
          {
            status: "failed",
            responseStatus,
            resultMetadata: {
              externalRequestSent:
                mode === "live",
              policyCode:
                policy.code,
              risk:
                policy.risk,
            },
            errorCode:
              code,
            errorMessage:
              message,
            retryable:
              retry.retryable,
            nextRetryAt:
              retry.nextRetryAt,
          },
        );

      await writeIntegrationOperationLog(
        supabase,
        {
          userId:
            user.id,
          integrationId:
            connection.id,
          providerId:
            connection.providerId,
          source:
            "action",
          eventType:
            retry.retryable
              ? "integration.action.retry_scheduled"
              : "integration.action.failed",
          severity:
            retry.retryable
              ? "warning"
              : "error",
          status:
            retry.retryable
              ? "retry_scheduled"
              : retry.exhausted
                ? "exhausted"
                : "failed",
          correlationId,
          actionExecutionId:
            failedExecution.id,
          attempt:
            failedExecution.attemptCount,
          maxAttempts:
            failedExecution.maxAttempts,
          retryable:
            retry.retryable,
          nextRetryAt:
            retry.nextRetryAt,
          errorCode:
            code,
          message,
          metadata: {
            capabilityId:
              capability.id,
            mode,
            responseStatus,
            retryReasonCode:
              retry.reasonCode,
          },
        },
      );

      throw executionError;
    }
  } catch (error) {
    const response =
      actionErrorResponse(error);

    return response ??
      integrationApiErrorResponse(
        error,
        "J10 NEXUS could not execute the integration action.",
      );
  }
}
