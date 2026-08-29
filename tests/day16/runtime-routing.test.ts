import { describe, expect, it } from "vitest";

import {
  getPersistedBranchStepExclusions,
  getUnselectedBranchStepOrders,
} from "@/lib/automation/graph-runtime-routing";

function step(stepOrder: number, targets: number[]) {
  return {
    step_order: stepOrder,
    config: {
      j10Flow: {
        outgoing: targets.map((targetStepOrder) => ({ targetStepOrder })),
      },
    },
  };
}

describe("Day 16 exclusive graph branch routing", () => {
  const steps = [
    step(1, [2, 4]),
    step(2, [3]),
    step(3, [6]),
    step(4, [5]),
    step(5, [6]),
    step(6, []),
  ];

  it("skips only the false branch when true is selected and preserves the join", () => {
    expect(getUnselectedBranchStepOrders(steps, 2, 4)).toEqual([4, 5]);
  });

  it("skips only the true branch when false is selected and preserves the join", () => {
    expect(getUnselectedBranchStepOrders(steps, 4, 2)).toEqual([2, 3]);
  });

  it("reconstructs the selected branch after a human-approval continuation", () => {
    expect(
      getPersistedBranchStepExclusions(steps, [
        {
          step_type: "condition",
          status: "completed",
          input_payload: {
            condition: {
              matched: true,
              on_true_step: 2,
              on_false_step: 4,
            },
          },
        },
      ]),
    ).toEqual([4, 5]);
  });
});
