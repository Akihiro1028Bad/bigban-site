import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { useToasts } from "./useToasts";

describe("useToasts", () => {
  it("同一tickで複数追加しても一意なIDを割り当てる", () => {
    const { result } = renderHook(() => useToasts());

    act(() => {
      result.current.pushToast("1件目");
      result.current.pushToast("2件目");
    });

    expect(result.current.toasts.map((toast) => toast.id)).toEqual([
      "toast-1",
      "toast-2",
    ]);
  });
});
