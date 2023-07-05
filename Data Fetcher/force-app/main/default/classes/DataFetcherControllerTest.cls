/**
 * @description       : 
 * @author            : Josh Dayment
 * @group             : 
 * @last modified on  : 06-23-2023
 * @last modified by  : Josh Dayment
**/
@isTest
private class DataFetcherControllerTest{

	@IsTest
	static void canQuery() {
	  insert new List<SObject>{ new Account(Name = 'One'), new Account(Name = 'Two') };
  
	  DataFetcherController2.QueryResult result = DataFetcherController2.getSObjects(
		'SELECT Id, Name FROM Account ORDER BY Name'
	  );
	  DataFetcherController2.AggQueryResult aggAmount = DataFetcherController2.getAggregate('SELECT COUNT(Id) FROM Account');
  
	  Assert.areEqual(2, result.results.size());
	  Assert.areEqual('One', result.firstResult.get(Account.Name));
	}
	
  }
