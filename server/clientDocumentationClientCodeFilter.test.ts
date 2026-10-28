import { describe, expect, it } from "vitest";
import { clientDocumentationMatchesClientCode } from "../shared/clientDocumentationClientCodeFilter";

describe("Client Documentation client-code filter", () => {
  const records = [
    { clientCode: "260071" },
    { clientCode: "260108" },
    { clientCode: "DXB-0042" },
    { clientCode: null },
  ];

  it("preserves the complete client list when no client code is entered", () => {
    expect(records.filter(record => clientDocumentationMatchesClientCode(record, "  "))).toEqual(records);
  });

  it("matches an exact client code without changing the records", () => {
    expect(records.filter(record => clientDocumentationMatchesClientCode(record, "260108")))
      .toEqual([{ clientCode: "260108" }]);
  });

  it("supports a case-insensitive partial client-code lookup and excludes blank codes", () => {
    expect(records.filter(record => clientDocumentationMatchesClientCode(record, "260")))
      .toEqual([{ clientCode: "260071" }, { clientCode: "260108" }]);
    expect(records.filter(record => clientDocumentationMatchesClientCode(record, "dxb")))
      .toEqual([{ clientCode: "DXB-0042" }]);
  });
});
