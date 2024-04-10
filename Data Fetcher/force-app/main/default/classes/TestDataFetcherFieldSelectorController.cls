/**
 * @description       : 
 * @author            : Josh Dayment
 * @group             : 
 * @last modified on  : 12-19-2023
 * @last modified by  : Josh Dayment
**/
@isTest
private class TestDataFetcherFieldSelectorController{

		@isTest
		public static void doTest() {
			DataFetcherFieldSelectorController.getObjectFields('Account');
		}
}