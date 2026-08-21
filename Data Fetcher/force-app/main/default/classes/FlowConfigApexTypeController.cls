public with sharing class FlowConfigApexTypeController {
  /** `Schema.describeSObjects` accepts at most 100 names per call. */
  private static final Integer DESCRIBE_CHUNK_SIZE = 100;

  private static Map<String, Schema.SObjectType> globalDescribeCache;
  private static Map<String, Schema.SObjectType> sobjectTypeMemo = new Map<String, Schema.SObjectType>();
  private static Boolean flowAuthoringResolved = false;
  private static Boolean flowAuthoringAllowed = false;

  /**
   * Enumerating every SObject is only needed to find custom settings. Resolving
   * it lazily keeps the single-object and Apex-source entry points off the
   * global describe path entirely.
   */
  private static Map<String, Schema.SObjectType> globalDescribe() {
    if (globalDescribeCache == null) {
      globalDescribeCache = Schema.getGlobalDescribe();
    }
    return globalDescribeCache;
  }

  /**
   * Resolves one SObject name without paying for a global describe. Returns
   * null when the name belongs to an Apex-defined type rather than an SObject.
   */
  private static Schema.SObjectType sobjectTypeFor(String candidate) {
    if (String.isBlank(candidate)) {
      return null;
    }
    if (sobjectTypeMemo.containsKey(candidate)) {
      return sobjectTypeMemo.get(candidate);
    }
    Schema.SObjectType resolved;
    try {
      // DEFERRED keeps child relationships unloaded. Only the type and its
      // fields are ever read here, and loading relationships for every
      // candidate is a large amount of wasted describe work.
      List<Schema.DescribeSObjectResult> described = Schema.describeSObjects(
        new List<String>{ candidate },
        SObjectDescribeOptions.DEFERRED
      );
      resolved = described.isEmpty() ? null : described[0].getSObjectType();
    } catch (Exception ignored) {
      resolved = null;
    }
    sobjectTypeMemo.put(candidate, resolved);
    return resolved;
  }

  /**
   * `with sharing` does not enforce object permissions, and `ApexClass.Body`
   * exposes the source of every unmanaged class in the org. Restrict source
   * inspection to users who can actually author Flows, so assigning the
   * framework permission set does not become a way to read Apex.
   *
   * PermissionSetAssignment is itself a setup object: users without setup
   * visibility cannot query it and get a QueryException rather than an empty
   * result. Treat any failure as "not a Flow author" so the check fails closed.
   * A denied user is not blocked from the picker — `loadApexMembers` falls back
   * to the Visualforce Tooling bridge, where the platform enforces the user's
   * own access instead of this class's.
   */
  private static Boolean canAuthorFlows() {
    if (!flowAuthoringResolved) {
      try {
        flowAuthoringAllowed = ![
            SELECT Id
            FROM PermissionSetAssignment
            WHERE
              AssigneeId = :UserInfo.getUserId()
              AND PermissionSet.PermissionsManageInteraction = TRUE
            WITH USER_MODE
            LIMIT 1
          ]
          .isEmpty();
      } catch (Exception ignored) {
        flowAuthoringAllowed = false;
      }
      flowAuthoringResolved = true;
    }
    return flowAuthoringAllowed;
  }

  public class MemberDescriptor implements Comparable {
    @AuraEnabled
    public String name { get; set; }
    @AuraEnabled
    public String label { get; set; }
    @AuraEnabled
    public String dataType { get; set; }
    @AuraEnabled
    public String apexClass { get; set; }
    @AuraEnabled
    public String objectType { get; set; }
    @AuraEnabled
    public Boolean isCollection { get; set; }
    @AuraEnabled
    public String sourceType { get; set; }
    @AuraEnabled
    public String sourceDataType { get; set; }
    @AuraEnabled
    public List<String> referenceTargets { get; set; }

    public Integer compareTo(Object other) {
      MemberDescriptor candidate = (MemberDescriptor) other;
      String left = String.isBlank(label) ? name : label;
      String right = String.isBlank(candidate.label)
        ? candidate.name
        : candidate.label;
      return left.toLowerCase().compareTo(right.toLowerCase());
    }
  }

  public class SObjectPathDescriptor {
    @AuraEnabled
    public String name { get; set; }
    @AuraEnabled
    public String label { get; set; }
    @AuraEnabled
    public String dataType { get; set; }
    @AuraEnabled
    public String sourceDataType { get; set; }
    @AuraEnabled
    public String objectType { get; set; }
    @AuraEnabled
    public Boolean isCollection { get; set; }
    @AuraEnabled
    public List<String> labels { get; set; }
    @AuraEnabled
    public List<String> objectTypes { get; set; }
    @AuraEnabled
    public String parentObjectType { get; set; }
    @AuraEnabled
    public List<String> referenceTargets { get; set; }
  }

  public class HierarchySettingDescriptor {
    @AuraEnabled
    public String name { get; set; }
    @AuraEnabled
    public String label { get; set; }
    @AuraEnabled
    public List<MemberDescriptor> fields { get; set; }
  }

  public class ObjectDescriptor implements Comparable {
    @AuraEnabled
    public String apiName { get; set; }
    @AuraEnabled
    public String label { get; set; }
    @AuraEnabled
    public String labelPlural { get; set; }
    @AuraEnabled
    public Boolean isCustom { get; set; }
    @AuraEnabled
    public Boolean isQueryable { get; set; }
    @AuraEnabled
    public Boolean isCreateable { get; set; }
    @AuraEnabled
    public Boolean isUpdateable { get; set; }
    @AuraEnabled
    public Boolean isDeletable { get; set; }
    @AuraEnabled
    public Boolean isSearchable { get; set; }
    @AuraEnabled
    public Boolean isCustomSetting { get; set; }

    public Integer compareTo(Object other) {
      ObjectDescriptor candidate = (ObjectDescriptor) other;
      String left = String.isBlank(label) ? apiName : label;
      String right = String.isBlank(candidate.label)
        ? candidate.apiName
        : candidate.label;
      Integer labelOrder = left.toLowerCase().compareTo(right.toLowerCase());
      return labelOrder == 0
        ? apiName.toLowerCase().compareTo(candidate.apiName.toLowerCase())
        : labelOrder;
    }
  }

  @AuraEnabled(cacheable=true)
  public static List<MemberDescriptor> describeType(String apexClassName) {
    if (String.isBlank(apexClassName)) {
      return new List<MemberDescriptor>();
    }
    if (!canAuthorFlows()) {
      throw new AuraHandledException(
        'Inspecting Apex-defined types requires the Manage Flow permission.'
      );
    }

    ClassIdentity identity = parseClassIdentity(apexClassName);
    List<ApexClass> candidates;
    try {
      // USER_MODE enforces the running user's own access to Apex source on top
      // of the Manage Flow check above, so this class never lends its system
      // mode to a caller. A user who cannot read ApexClass falls through to the
      // Tooling bridge, which is subject to the same access.
      candidates = [
        SELECT Name, NamespacePrefix, Body
        FROM ApexClass
        WHERE Name = :identity.className
        WITH USER_MODE
      ];
    } catch (Exception ignored) {
      throw new AuraHandledException(
        'Unable to read Apex source for "' + apexClassName + '".'
      );
    }
    for (ApexClass candidate : candidates) {
      if (
        candidate.NamespacePrefix == identity.namespacePrefix ||
        (candidate.NamespacePrefix != null &&
        identity.namespacePrefix != null &&
        candidate.NamespacePrefix.equalsIgnoreCase(identity.namespacePrefix))
      ) {
        return parseBody(candidate.Body, candidate.NamespacePrefix);
      }
    }
    if (identity.namespacePrefix == null && candidates.size() == 1) {
      ApexClass onlyCandidate = candidates[0];
      return parseBody(onlyCandidate.Body, onlyCandidate.NamespacePrefix);
    }
    throw new AuraHandledException(
      'Unable to resolve Apex-defined type "' + apexClassName + '".'
    );
  }

  @AuraEnabled(cacheable=true)
  public static SObjectPathDescriptor describeSObjectPath(
    String objectApiName,
    String fieldPath
  ) {
    if (String.isBlank(objectApiName) || String.isBlank(fieldPath)) {
      return null;
    }
    Schema.SObjectType currentType = sobjectTypeFor(objectApiName);
    if (currentType == null || !currentType.getDescribe().isAccessible()) {
      return null;
    }

    List<String> labels = new List<String>();
    List<String> objectTypes = new List<String>();
    Schema.DescribeFieldResult finalField;
    String parentObjectType;
    List<String> pathSegments = fieldPath.split('\\.');
    for (Integer pathIndex = 0; pathIndex < pathSegments.size(); pathIndex++) {
      String segment = pathSegments[pathIndex];
      Schema.SObjectField token = findField(currentType, segment);
      if (token == null) {
        return null;
      }
      parentObjectType = currentType.getDescribe().getName();
      finalField = token.getDescribe();
      if (!finalField.isAccessible()) {
        return null;
      }
      String nextSegment = pathIndex < pathSegments.size() - 1
        ? pathSegments[pathIndex + 1]
        : null;
      Schema.SObjectType referenceType = referenceForPath(
        finalField,
        nextSegment
      );
      labels.add(
        pathIndex < pathSegments.size() - 1 &&
          !String.isBlank(finalField.getRelationshipName())
          ? finalField.getRelationshipName()
          : finalField.getLabel()
      );
      if (referenceType != null) {
        currentType = referenceType;
        objectTypes.add(currentType.getDescribe().getName());
      } else {
        if (nextSegment != null) {
          return null;
        }
        objectTypes.add(null);
      }
    }

    if (finalField == null) {
      return null;
    }
    String sourceType = String.valueOf(finalField.getType());
    String dataType = flowDataTypeForField(finalField.getType());
    MemberDescriptor fieldDescriptor = describeField(finalField);
    SObjectPathDescriptor descriptor = new SObjectPathDescriptor();
    descriptor.name = fieldDescriptor.name;
    descriptor.label = fieldDescriptor.label;
    descriptor.dataType = dataType;
    descriptor.sourceDataType = sourceType;
    descriptor.objectType = fieldDescriptor.objectType;
    descriptor.isCollection = false;
    descriptor.labels = labels;
    descriptor.objectTypes = objectTypes;
    descriptor.parentObjectType = parentObjectType;
    descriptor.referenceTargets = fieldDescriptor.referenceTargets;
    return descriptor;
  }

  /**
   * Returns every SObject visible to the running user. Consumers apply their
   * own queryable/createable filters so one cached describe response can serve
   * every object picker in a property editor.
   */
  @AuraEnabled(cacheable=true)
  public static List<ObjectDescriptor> describeObjects() {
    List<String> candidateNames = new List<String>(globalDescribe().keySet());
    candidateNames.sort();
    List<ObjectDescriptor> objects = new List<ObjectDescriptor>();
    for (
      Integer offset = 0;
      offset < candidateNames.size();
      offset += DESCRIBE_CHUNK_SIZE
    ) {
      Integer limitIndex = Math.min(
        offset + DESCRIBE_CHUNK_SIZE,
        candidateNames.size()
      );
      List<String> chunk = new List<String>();
      for (Integer index = offset; index < limitIndex; index++) {
        chunk.add(candidateNames[index]);
      }
      for (
        Schema.DescribeSObjectResult objectDescribe : Schema.describeSObjects(
          chunk,
          SObjectDescribeOptions.DEFERRED
        )
      ) {
        if (
          !objectDescribe.isAccessible() ||
          objectDescribe.isDeprecatedAndHidden()
        ) {
          continue;
        }
        ObjectDescriptor descriptor = new ObjectDescriptor();
        descriptor.apiName = objectDescribe.getName();
        descriptor.label = objectDescribe.getLabel();
        descriptor.labelPlural = objectDescribe.getLabelPlural();
        descriptor.isCustom = objectDescribe.isCustom();
        descriptor.isQueryable = objectDescribe.isQueryable();
        descriptor.isCreateable = objectDescribe.isCreateable();
        descriptor.isUpdateable = objectDescribe.isUpdateable();
        descriptor.isDeletable = objectDescribe.isDeletable();
        descriptor.isSearchable = objectDescribe.isSearchable();
        descriptor.isCustomSetting = objectDescribe.isCustomSetting();
        objects.add(descriptor);
      }
    }
    objects.sort();
    return objects;
  }

  @AuraEnabled(cacheable=true)
  public static List<HierarchySettingDescriptor> describeHierarchySettings() {
    List<HierarchySettingDescriptor> settings = new List<HierarchySettingDescriptor>();
    // Custom settings are always custom objects, so filtering on the API-name
    // suffix first avoids describing every SObject in the org. A full describe
    // per object is expensive enough to risk the synchronous CPU limit in large
    // orgs, and only a handful of objects can ever match.
    List<String> candidateNames = new List<String>();
    for (String objectName : globalDescribe().keySet()) {
      if (objectName.endsWithIgnoreCase('__c')) {
        candidateNames.add(objectName);
      }
    }
    candidateNames.sort();

    for (
      Integer offset = 0;
      offset < candidateNames.size();
      offset += DESCRIBE_CHUNK_SIZE
    ) {
      Integer limitIndex = Math.min(
        offset + DESCRIBE_CHUNK_SIZE,
        candidateNames.size()
      );
      List<String> chunk = new List<String>();
      for (Integer index = offset; index < limitIndex; index++) {
        chunk.add(candidateNames[index]);
      }
      for (
        Schema.DescribeSObjectResult objectDescribe : Schema.describeSObjects(
          chunk,
          SObjectDescribeOptions.DEFERRED
        )
      ) {
        HierarchySettingDescriptor setting = toHierarchySetting(objectDescribe);
        if (setting != null) {
          settings.add(setting);
        }
      }
    }
    return settings;
  }

  private static HierarchySettingDescriptor toHierarchySetting(
    Schema.DescribeSObjectResult objectDescribe
  ) {
    if (!objectDescribe.isAccessible() || !objectDescribe.isCustomSetting()) {
      return null;
    }
    // Apex describe does not expose the hierarchy/list custom-setting kind
    // directly. Hierarchy settings leave Name nillable; list settings require
    // it, so a nillable Name is the supported way to tell them apart.
    Schema.SObjectField nameToken = objectDescribe.fields.getMap().get('Name');
    if (nameToken == null || !nameToken.getDescribe().isNillable()) {
      return null;
    }
    List<MemberDescriptor> fields = new List<MemberDescriptor>();
    for (
      Schema.SObjectField fieldToken : objectDescribe.fields.getMap().values()
    ) {
      Schema.DescribeFieldResult fieldDescribe = fieldToken.getDescribe();
      if (!fieldDescribe.isCustom() || !fieldDescribe.isAccessible()) {
        continue;
      }
      fields.add(describeField(fieldDescribe));
    }
    if (fields.isEmpty()) {
      return null;
    }
    fields.sort();
    HierarchySettingDescriptor setting = new HierarchySettingDescriptor();
    setting.name = objectDescribe.getName();
    setting.label = objectDescribe.getLabel();
    setting.fields = fields;
    return setting;
  }

  private static Schema.SObjectField findField(
    Schema.SObjectType objectType,
    String pathSegment
  ) {
    Map<String, Schema.SObjectField> fields = objectType
      .getDescribe()
      .fields.getMap();
    Schema.SObjectField exactMatch = fields.get(pathSegment);
    if (exactMatch != null) {
      return exactMatch;
    }
    for (String apiName : fields.keySet()) {
      Schema.SObjectField candidate = fields.get(apiName);
      Schema.DescribeFieldResult fieldDescribe = candidate.getDescribe();
      if (
        apiName.equalsIgnoreCase(pathSegment) ||
        (!String.isBlank(fieldDescribe.getRelationshipName()) &&
        fieldDescribe.getRelationshipName().equalsIgnoreCase(pathSegment))
      ) {
        return candidate;
      }
    }
    return null;
  }

  private static Schema.SObjectType firstReference(
    Schema.DescribeFieldResult fieldDescribe
  ) {
    List<Schema.SObjectType> references = accessibleReferences(fieldDescribe);
    return references.isEmpty() ? null : references[0];
  }

  private static Schema.SObjectType referenceForPath(
    Schema.DescribeFieldResult fieldDescribe,
    String nextSegment
  ) {
    List<Schema.SObjectType> references = accessibleReferences(fieldDescribe);
    if (String.isBlank(nextSegment)) {
      return references.isEmpty() ? null : references[0];
    }
    for (Schema.SObjectType referenceType : references) {
      Schema.SObjectField nextField = findField(referenceType, nextSegment);
      if (nextField != null && nextField.getDescribe().isAccessible()) {
        return referenceType;
      }
    }
    return null;
  }

  private static List<Schema.SObjectType> accessibleReferences(
    Schema.DescribeFieldResult fieldDescribe
  ) {
    List<Schema.SObjectType> accessible = new List<Schema.SObjectType>();
    for (Schema.SObjectType referenceType : fieldDescribe.getReferenceTo()) {
      if (referenceType.getDescribe().isAccessible()) {
        accessible.add(referenceType);
      }
    }
    return accessible;
  }

  private static MemberDescriptor describeField(
    Schema.DescribeFieldResult fieldDescribe
  ) {
    Schema.SObjectType referenceType = firstReference(fieldDescribe);
    List<String> referenceTargets = new List<String>();
    for (Schema.SObjectType candidate : accessibleReferences(fieldDescribe)) {
      referenceTargets.add(candidate.getDescribe().getName());
    }
    MemberDescriptor descriptor = new MemberDescriptor();
    descriptor.name = fieldDescribe.getName();
    descriptor.label = fieldDescribe.getLabel();
    descriptor.dataType = flowDataTypeForField(fieldDescribe.getType());
    descriptor.sourceDataType = String.valueOf(fieldDescribe.getType());
    descriptor.sourceType = descriptor.sourceDataType;
    descriptor.objectType = referenceType == null
      ? null
      : referenceType.getDescribe().getName();
    descriptor.referenceTargets = referenceTargets;
    descriptor.isCollection = false;
    return descriptor;
  }

  private static String flowDataTypeForField(Schema.DisplayType fieldType) {
    if (fieldType == Schema.DisplayType.Boolean) {
      return 'Boolean';
    }
    if (fieldType == Schema.DisplayType.Currency) {
      return 'Currency';
    }
    if (fieldType == Schema.DisplayType.Date) {
      return 'Date';
    }
    if (fieldType == Schema.DisplayType.DateTime) {
      return 'DateTime';
    }
    if (
      fieldType == Schema.DisplayType.Double ||
      fieldType == Schema.DisplayType.Integer ||
      fieldType == Schema.DisplayType.Long ||
      fieldType == Schema.DisplayType.Percent
    ) {
      return 'Number';
    }
    if (fieldType == Schema.DisplayType.MultiPicklist) {
      return 'Multipicklist';
    }
    if (fieldType == Schema.DisplayType.Picklist) {
      return 'Picklist';
    }
    if (fieldType == Schema.DisplayType.Time) {
      return 'Time';
    }
    if (fieldType == Schema.DisplayType.Reference) {
      return 'SObject';
    }
    return 'String';
  }

  @TestVisible
  private static List<MemberDescriptor> parseBody(
    String body,
    String namespacePrefix
  ) {
    List<MemberDescriptor> members = new List<MemberDescriptor>();
    if (String.isBlank(body)) {
      return members;
    }

    String source = body
      .replaceAll('(?s)/\\*.*?\\*/', ' ')
      .replaceAll('(?m)//.*$', ' ');
    Pattern memberPattern = Pattern.compile(
      '(?is)@AuraEnabled(?:\\s*\\([^)]*\\))?\\s+' +
        '(?:(?:global|public|protected|private|static|transient|virtual|override|final)\\s+)*' +
        '([A-Za-z_][A-Za-z0-9_.$<>\\[\\], ]*)\\s+' +
        '([A-Za-z_][A-Za-z0-9_]*)\\s*(?:;|\\{)'
    );
    Matcher matcher = memberPattern.matcher(source);
    Set<String> seenNames = new Set<String>();
    while (matcher.find()) {
      String memberName = matcher.group(2);
      if (seenNames.contains(memberName)) {
        continue;
      }
      seenNames.add(memberName);
      members.add(
        toDescriptor(memberName, matcher.group(1).trim(), namespacePrefix)
      );
    }
    return members;
  }

  private static MemberDescriptor toDescriptor(
    String memberName,
    String declaredType,
    String namespacePrefix
  ) {
    MemberDescriptor descriptor = new MemberDescriptor();
    descriptor.name = memberName;
    descriptor.label = humanize(memberName);
    descriptor.sourceType = declaredType;

    String valueType = declaredType.replaceAll('\\s+', '');
    descriptor.isCollection = valueType.endsWith('[]');
    if (descriptor.isCollection) {
      valueType = valueType.substring(0, valueType.length() - 2);
    }
    Matcher collectionMatcher = Pattern.compile('(?i)^(?:List|Set)<(.+)>$')
      .matcher(valueType);
    if (collectionMatcher.matches()) {
      descriptor.isCollection = true;
      valueType = collectionMatcher.group(1);
    }

    String normalized = valueType.toLowerCase();
    if (
      new Set<String>{ 'decimal', 'double', 'integer', 'long' }
        .contains(normalized)
    ) {
      descriptor.dataType = 'Number';
    } else if (normalized == 'boolean') {
      descriptor.dataType = 'Boolean';
    } else if (normalized == 'date') {
      descriptor.dataType = 'Date';
    } else if (normalized == 'datetime') {
      descriptor.dataType = 'DateTime';
    } else if (normalized == 'time') {
      descriptor.dataType = 'Time';
    } else if (new Set<String>{ 'string', 'id' }.contains(normalized)) {
      descriptor.dataType = 'String';
    } else {
      // Only a non-scalar declaration needs a describe to tell an SObject apart
      // from an Apex-defined type.
      Schema.SObjectType valueSObjectType = sobjectTypeFor(valueType);
      if (valueSObjectType != null) {
        descriptor.dataType = 'SObject';
        descriptor.objectType = valueSObjectType.getDescribe().getName();
      } else {
        descriptor.dataType = 'Apex';
        descriptor.apexClass = qualifyApexType(valueType, namespacePrefix);
      }
    }
    return descriptor;
  }

  private static String qualifyApexType(
    String valueType,
    String namespacePrefix
  ) {
    if (valueType.contains('__') || valueType.contains('.')) {
      return valueType;
    }
    return String.isBlank(namespacePrefix)
      ? valueType
      : namespacePrefix + '__' + valueType;
  }

  private static String humanize(String value) {
    String label = value.replaceAll('([a-z0-9])([A-Z])', '$1 $2');
    return label.substring(0, 1).toUpperCase() + label.substring(1);
  }

  private class ClassIdentity {
    String namespacePrefix;
    String className;
  }

  private static ClassIdentity parseClassIdentity(String apexClassName) {
    ClassIdentity identity = new ClassIdentity();
    String normalized = apexClassName
      .trim()
      .replace('{', '')
      .replace('}', '')
      .replace('[]', '');
    normalized = normalized.replaceAll('(?i)^apex://', '');
    normalized = normalized.replace('/', '.').replace(':', '.');
    Integer namespaceSeparator = normalized.indexOf('__');
    if (namespaceSeparator > 0) {
      identity.namespacePrefix = normalized.substring(0, namespaceSeparator);
      identity.className = normalized.substring(namespaceSeparator + 2);
      return identity;
    }
    List<String> dotted = normalized.split('\\.');
    if (dotted.size() == 2) {
      identity.namespacePrefix = dotted[0];
      identity.className = dotted[1];
    } else {
      identity.namespacePrefix = null;
      identity.className = normalized;
    }
    return identity;
  }
}
