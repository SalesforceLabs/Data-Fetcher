import {
  filterPreparedObjects,
  filterObjects,
  isNormalObject,
  normalizeObjectDescriptor,
  prepareObjects
} from "c/flowConfigObjectModel";

describe("flowConfigObjectModel", () => {
  it("uses the API name when Salesforce returns a missing-label marker", () => {
    expect(
      normalizeObjectDescriptor({
        apiName: "AppointmentInvitationFeed",
        label: "__MISSING LABEL__ PropertyFile - val Label"
      }).label
    ).toBe("AppointmentInvitationFeed");
  });

  it("recognizes normal standard, custom, and external objects", () => {
    expect(isNormalObject({ apiName: "Account", isSearchable: true })).toBe(
      true
    );
    expect(isNormalObject({ apiName: "Widget__c", isCustom: true })).toBe(true);
    expect(isNormalObject({ apiName: "Inventory__x", isCustom: true })).toBe(
      true
    );
  });

  it("hides feeds, histories, shares, events, settings, and internal read-only objects by default", () => {
    [
      { apiName: "AccountFeed", isSearchable: true },
      { apiName: "AccountHistory", isSearchable: true },
      { apiName: "AccountShare", isSearchable: true },
      { apiName: "Order_Event__e", isCustom: true },
      { apiName: "Settings__c", isCustom: true, isCustomSetting: true },
      { apiName: "AppointmentInvitationFeed" }
    ].forEach((object) => expect(isNormalObject(object)).toBe(false));
  });

  it("reveals every permitted object when show all is enabled", () => {
    const objects = [
      { apiName: "Account", label: "Account", isSearchable: true },
      {
        apiName: "AppointmentInvitationFeed",
        label: "__MISSING LABEL__ PropertyFile - val Label",
        isQueryable: true
      }
    ];

    expect(filterObjects(objects).map((object) => object.apiName)).toEqual([
      "Account"
    ]);
    expect(
      filterObjects(objects, { showAll: true }).map((object) => object.apiName)
    ).toEqual(["Account", "AppointmentInvitationFeed"]);
  });

  it("composes search, allowlist, and queryable filters", () => {
    const objects = [
      {
        apiName: "Account",
        label: "Account",
        isSearchable: true,
        isQueryable: true
      },
      {
        apiName: "Contact",
        label: "Contact",
        isSearchable: true,
        isQueryable: false
      }
    ];

    expect(
      filterObjects(objects, {
        query: "acc",
        allowedObjectNames: new Set(["account", "contact"]),
        queryableOnly: true
      }).map((object) => object.apiName)
    ).toEqual(["Account"]);
  });

  it("reuses a prepared, alphabetized object index for local searches", () => {
    const prepared = prepareObjects([
      { apiName: "Widget__c", label: "Widget", isCustom: true },
      { apiName: "Account", label: "Account", isSearchable: true }
    ]);
    expect(prepared.map((object) => object.apiName)).toEqual([
      "Account",
      "Widget__c"
    ]);
    expect(
      filterPreparedObjects(prepared, { query: "wid" }).map(
        (object) => object.apiName
      )
    ).toEqual(["Widget__c"]);
  });
});
