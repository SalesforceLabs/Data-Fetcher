/**
 * @description       : 
 * @author            : Josh Dayment
 * @group             : 
 * @last modified on  : 8-3-2026
 * @last modified by  : Josh Dayment
**/
@IsTest
private class TestDataFetcherFieldSelectorController {

	@isTest
	public static void doTest() {
		DataFetcherFieldSelectorController.getObjectFields('User');
	}
}