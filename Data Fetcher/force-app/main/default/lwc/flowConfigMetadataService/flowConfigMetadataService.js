import describeApexType from "@salesforce/apex/FlowConfigApexTypeController.describeType";
import describeHierarchySettings from "@salesforce/apex/FlowConfigApexTypeController.describeHierarchySettings";

const metadataRequests = new Map();

export function parseMetadataList(response, propertyName) {
  if (Array.isArray(response)) {
    return response;
  }
  if (typeof response === "string") {
    return parseMetadataList(JSON.parse(response), propertyName);
  }
  return Array.isArray(response?.[propertyName]) ? response[propertyName] : [];
}

/** Shares one metadata promise across every picker instance. */
export function loadSharedMetadata(key, loader) {
  if (!metadataRequests.has(key)) {
    let loaded;
    try {
      loaded = loader();
    } catch (error) {
      loaded = Promise.reject(error);
    }
    const request = Promise.resolve(loaded);
    metadataRequests.set(key, request);
    request.catch(() => {
      if (metadataRequests.get(key) === request) {
        metadataRequests.delete(key);
      }
    });
  }
  return metadataRequests.get(key);
}

export function loadApexMembers(apexClassName) {
  return loadSharedMetadata(`apex:${apexClassName}`, () =>
    describeApexType({ apexClassName }).then((result) =>
      parseMetadataList(result, "members")
    )
  );
}

export function loadHierarchySettings() {
  return loadSharedMetadata("global:$Setup", () => describeHierarchySettings());
}

export function clearMetadataCache() {
  metadataRequests.clear();
}
