/**
 * @description       : 
 * @author            : Josh Dayment
 * @group             : 
 * @last modified on  : 02-21-2023
 * @last modified by  : Josh Dayment
**/
@IsTest
private class DataFetcherControllerTest {
  @IsTest
  static void canQuery() {
    insert new List<SObject>{ new Account(Name = 'One'), new Account(Name = 'Two') };

    DataFetcherController.QueryResult result = DataFetcherController.getSObjects(
      'SELECT Id, Name FROM Account ORDER BY Name'
    );

    Assert.areEqual(2, result.results.size());
    Assert.areEqual('One', result.firstResult.get(Account.Name));
  }
}