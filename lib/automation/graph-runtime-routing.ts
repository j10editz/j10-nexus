type RuntimeGraphStep = {
  step_order: number;
  config: Record<string, unknown> | null;
};

type RuntimeGraphEdge = {
  targetStepOrder: number;
};

type PersistedConditionStep = {
  step_type: string;
  status: string;
  input_payload: Record<string, unknown> | null;
};

export function getUnselectedBranchStepOrders(
  steps: RuntimeGraphStep[],
  selectedTargetStepOrder: number | null,
  unselectedTargetStepOrder: number | null,
) {
  if (selectedTargetStepOrder === null || unselectedTargetStepOrder === null) {
    return [];
  }

  const selectedReachable = collectReachableStepOrders(
    steps,
    selectedTargetStepOrder,
  );
  const unselectedReachable = collectReachableStepOrders(
    steps,
    unselectedTargetStepOrder,
  );

  return [...unselectedReachable]
    .filter((stepOrder) => !selectedReachable.has(stepOrder))
    .sort((left, right) => left - right);
}

export function getPersistedBranchStepExclusions(
  steps: RuntimeGraphStep[],
  runSteps: PersistedConditionStep[],
) {
  const excluded = new Set<number>();

  for (const runStep of runSteps) {
    if (runStep.step_type !== "condition" || runStep.status !== "completed") {
      continue;
    }

    const condition = isRecord(runStep.input_payload?.condition)
      ? runStep.input_payload.condition
      : null;

    if (!condition || typeof condition.matched !== "boolean") {
      continue;
    }

    const trueStep = readStepOrder(condition.on_true_step);
    const falseStep = readStepOrder(condition.on_false_step);
    const selected = condition.matched ? trueStep : falseStep;
    const unselected = condition.matched ? falseStep : trueStep;

    for (const stepOrder of getUnselectedBranchStepOrders(
      steps,
      selected,
      unselected,
    )) {
      excluded.add(stepOrder);
    }
  }

  return [...excluded].sort((left, right) => left - right);
}

function collectReachableStepOrders(
  steps: RuntimeGraphStep[],
  startStepOrder: number,
) {
  const stepByOrder = new Map(steps.map((step) => [step.step_order, step]));
  const visited = new Set<number>();
  const queue = [startStepOrder];

  while (queue.length > 0) {
    const current = queue.shift();

    if (current === undefined || visited.has(current)) {
      continue;
    }

    const step = stepByOrder.get(current);

    if (!step) {
      continue;
    }

    visited.add(current);

    for (const edge of readOutgoingEdges(step.config)) {
      if (!visited.has(edge.targetStepOrder)) {
        queue.push(edge.targetStepOrder);
      }
    }
  }

  return visited;
}

function readOutgoingEdges(
  config: Record<string, unknown> | null,
): RuntimeGraphEdge[] {
  if (!isRecord(config) || !isRecord(config.j10Flow)) {
    return [];
  }

  const outgoing = config.j10Flow.outgoing;

  if (!Array.isArray(outgoing)) {
    return [];
  }

  return outgoing.flatMap((value) => {
    if (
      !isRecord(value) ||
      typeof value.targetStepOrder !== "number" ||
      !Number.isInteger(value.targetStepOrder)
    ) {
      return [];
    }

    return [{ targetStepOrder: value.targetStepOrder }];
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readStepOrder(value: unknown) {
  return typeof value === "number" && Number.isInteger(value) && value > 0
    ? value
    : null;
}
