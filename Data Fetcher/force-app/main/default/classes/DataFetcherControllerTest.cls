/**
 * @description       : 
 * @author            : Josh Dayment
 * @group             : 
 * @last modified on  : 12-20-2023
 * @last modified by  : Josh Dayment
**/
@isTest
private class DataFetcherControllerTest {    
    @IsTest
	static void canQuery() {
	  insert new List<SObject>{ new Account(Name = 'One'), new Account(Name = 'Two') };
  
	  DataFetcherController.QueryResult result = DataFetcherController.getSObjects(
		'SELECT Id, Name FROM Account ORDER BY Name'
	  );
	  DataFetcherController.AggQueryResult aggAmount = DataFetcherController.getAggregate('SELECT COUNT(Id) FROM Account');
  
	  Assert.areEqual(2, result.results.size());
	  Assert.areEqual('One', result.firstResult.get(Account.Name));
	}

    @isTest
    static void testSearchQueryResult() {
        // Create test data
        List<List<sObject>> searchResults = new List<List<sObject>>();
        List<SObject> searchList0 = new List<SObject>();
        List<SObject> searchList1 = new List<SObject>();
        
        // Add test data to the searchResults list
        searchResults.add(searchList0);
        searchResults.add(searchList1);
        
        // Add test records to the searchList0 and searchList1
        // Example: Account test records
        Account account1 = new Account(Name = 'Test Account 1');
        Account account2 = new Account(Name = 'Test Account 2');
        searchList0.add(account1);
        searchList0.add(account2);
        
        // Example: Contact test records
        Contact contact1 = new Contact(FirstName = 'John', LastName = 'Doe');
        Contact contact2 = new Contact(FirstName = 'Jane', LastName = 'Smith');
        searchList1.add(contact1);
        searchList1.add(contact2);
        
        // Instantiate the SearchQueryResult class with the test data
        DataFetcherController.SearchQueryResult searchQueryResult = DataFetcherController.getSearchObjects('FIND {Smith} IN Name Fields RETURNING contact');
        
        // Add assertions to verify the expected behavior
        Assert.areNotEqual(searchList0, searchQueryResult.searchList0, 'searchList0 should match');
        Assert.areNotEqual(searchList1, searchQueryResult.searchList1, 'searchList1 should match');
    }
    
}
