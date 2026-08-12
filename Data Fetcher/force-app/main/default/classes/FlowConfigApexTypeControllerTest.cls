@IsTest
private class FlowConfigApexTypeControllerTest {
  @IsTest
  static void parsesScalarCollectionRecordAndNestedMembers() {
    String body =
      'public class Example {' +
      ' @AuraEnabled global Decimal amount;' +
      ' @AuraEnabled public List<Contact> contacts { get; set; }' +
      ' @AuraEnabled public ChildDetail detail;' +
      ' public String ignored;' +
      '}';

    Test.startTest();
    List<FlowConfigApexTypeController.MemberDescriptor> members = FlowConfigApexTypeController.parseBody(
      body,
      'sample'
    );
    Test.stopTest();

    System.assertEquals(3, members.size());
    System.assertEquals('amount', members[0].name);
    System.assertEquals('Amount', members[0].label);
    System.assertEquals('Number', members[0].dataType);
    System.assertEquals(false, members[0].isCollection);
    System.assertEquals('SObject', members[1].dataType);
    System.assertEquals('Contact', members[1].objectType);
    System.assertEquals(true, members[1].isCollection);
    System.assertEquals('Apex', members[2].dataType);
    System.assertEquals('sample__ChildDetail', members[2].apexClass);
  }

  @IsTest
  static void returnsNoMembersForBlankOrUnknownTypes() {
    System.assertEquals(
      0,
      FlowConfigApexTypeController.describeType(null).size()
    );
    try {
      FlowConfigApexTypeController.describeType('ClassThatDoesNotExist');
      System.assert(false, 'Expected an unresolved type error');
    } catch (AuraHandledException expected) {
      System.assertNotEquals(null, expected);
    }
  }

  @IsTest
  static void describesAnInstalledApexClassAsTypedMembers() {
    Test.startTest();
    List<FlowConfigApexTypeController.MemberDescriptor> members = FlowConfigApexTypeController.describeType(
      'apex://FlowConfigApexTypeController'
    );
    Test.stopTest();

    System.assert(members.size() >= 7, 'Expected Aura-enabled wrapper fields');
    FlowConfigApexTypeController.MemberDescriptor nameMember;
    for (FlowConfigApexTypeController.MemberDescriptor member : members) {
      if (member.name == 'name') {
        nameMember = member;
        break;
      }
    }
    System.assertNotEquals(null, nameMember);
    System.assertEquals('String', nameMember.dataType);
    System.assertEquals(false, nameMember.isCollection);
  }

  @IsTest
  static void describesDeepSObjectPaths() {
    FlowConfigApexTypeController.SObjectPathDescriptor descriptor = FlowConfigApexTypeController.describeSObjectPath(
      'Opportunity',
      'Account.AccountSource'
    );
    System.assertEquals('Account Source', descriptor.label);
    System.assertEquals('Picklist', descriptor.dataType);
    System.assertEquals('PICKLIST', descriptor.sourceDataType);
    System.assertEquals(
      new List<String>{ 'Account', 'Account Source' },
      descriptor.labels
    );
    System.assertEquals('Account', descriptor.parentObjectType);
    System.assertEquals(
      new List<String>{ 'Account', null },
      descriptor.objectTypes
    );
  }

  @IsTest
  static void exposesAccessibleRelationshipTargets() {
    FlowConfigApexTypeController.SObjectPathDescriptor descriptor = FlowConfigApexTypeController.describeSObjectPath(
      'Opportunity',
      'AccountId'
    );
    System.assertEquals('SObject', descriptor.dataType);
    System.assertEquals(
      new List<String>{ 'Account' },
      descriptor.referenceTargets
    );
  }

  @IsTest
  static void returnsTypedHierarchySettingMetadata() {
    List<FlowConfigApexTypeController.HierarchySettingDescriptor> result = FlowConfigApexTypeController.describeHierarchySettings();
    System.assertNotEquals(null, result);
  }

  @IsTest
  static void describesAccessibleObjectsForPickers() {
    Test.startTest();
    List<FlowConfigApexTypeController.ObjectDescriptor> objects = FlowConfigApexTypeController.describeObjects();
    Test.stopTest();

    System.assert(!objects.isEmpty(), 'Expected accessible objects');
    FlowConfigApexTypeController.ObjectDescriptor account;
    for (FlowConfigApexTypeController.ObjectDescriptor descriptor : objects) {
      if (descriptor.apiName == 'Account') {
        account = descriptor;
        break;
      }
    }
    System.assertNotEquals(null, account);
    System.assert(String.isNotBlank(account.label));
    System.assertEquals(true, account.isQueryable);
  }

  @IsTest
  static void refusesApexSourceInspectionWithoutFlowAuthoring() {
    User restricted = buildUserWithoutFlowAuthoring();

    System.runAs(restricted) {
      try {
        FlowConfigApexTypeController.describeType(
          'apex://FlowConfigApexTypeController'
        );
        System.assert(
          false,
          'Expected Apex source inspection to require Manage Flow'
        );
      } catch (AuraHandledException expected) {
        System.assertNotEquals(null, expected);
      }
    }
  }

  @IsTest
  static void allowsBlankTypeWithoutFlowAuthoring() {
    User restricted = buildUserWithoutFlowAuthoring();

    System.runAs(restricted) {
      System.assertEquals(
        0,
        FlowConfigApexTypeController.describeType(null).size()
      );
    }
  }

  /**
   * Profile names are localized, so the profile is selected by the permission
   * under test rather than by name.
   */
  private static User buildUserWithoutFlowAuthoring() {
    Profile restrictedProfile = [
      SELECT Id
      FROM Profile
      WHERE PermissionsManageInteraction = FALSE AND UserType = 'Standard'
      LIMIT 1
    ];
    User restricted = new User(
      Alias = 'fcek',
      Email = 'flow.config.kit@example.invalid',
      EmailEncodingKey = 'UTF-8',
      LanguageLocaleKey = 'en_US',
      LastName = 'Restricted',
      LocaleSidKey = 'en_US',
      ProfileId = restrictedProfile.Id,
      TimeZoneSidKey = 'America/Los_Angeles',
      UserName = 'flow.config.kit.' +
        DateTime.now().getTime() +
        '@example.invalid'
    );
    insert restricted;
    return restricted;
  }
}
