/**
 * @description       : 
 * @author            : Josh Dayment
 * @group             : 
 * @last modified on  : 12-20-2023
 * @last modified by  : Josh Dayment
**/
@isTest
private class TestDataFetcherObjectPickerController{
    private final static String TEST_OBJECT_TYPE_LEAD = 'Lead';
    private final static String TEST_OBJECT_PICKLIST_FIELD = 'LeadSource';

    @isTest
    public static void testGetPicklistValues() {
        List<DataFetcherObjectPickerController.Member> memberList = DataFetcherObjectPickerController.getPicklistValues(TEST_OBJECT_TYPE_LEAD, TEST_OBJECT_PICKLIST_FIELD);
        System.assertNotEquals(memberList, null);
    }

    @isTest
    public static void testGetObjects() {
        List<DataFetcherObjectPickerController.Member> memberList = DataFetcherObjectPickerController.getObjects(new List<String>{
                TEST_OBJECT_TYPE_LEAD
        });
        System.assertEquals(1, memberList.size());
        System.assertEquals(TEST_OBJECT_TYPE_LEAD, memberList[0].value);
        memberList = DataFetcherObjectPickerController.getObjects(null);
        System.assertEquals(true, memberList.size() > 1);
    }
}