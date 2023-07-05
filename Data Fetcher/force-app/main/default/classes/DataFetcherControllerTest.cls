/**
 * @description       : 
 * @author            : Josh Dayment
 * @group             : 
 * @last modified on  : 07-05-2023
 * @last modified by  : Josh Dayment
**/
@isTest
private class DataFetcherControllerTest{

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
	
  }
