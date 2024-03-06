/**
 * @description       : 
 * @author            : Josh Dayment
 * @group             : 
 * @last modified on  : 12-20-2023
 * @last modified by  : Josh Dayment
**/
public with sharing class DataFetcherController {         
    
  @AuraEnabled
  public static QueryResult getSObjects(String queryString) {
    return new QueryResult(Database.query(queryString, System.AccessLevel.USER_MODE));
  }
  
  @AuraEnabled
  public static AggQueryResult getAggregate(String aggQueryString) {
    return new AggQueryResult(Database.query(aggQueryString, System.AccessLevel.USER_MODE));
  }

  @AuraEnabled
  public static SearchQueryResult getSearchObjects(String searchString){
    return new SearchQueryResult(search.query(searchString, System.AccessLevel.USER_MODE));
  }     
  
  public class QueryResult {
    public QueryResult(List<SObject> results) {
      this.results = results;
      if (this.results.isEmpty() == false) {
        this.firstResult = this.results.get(0);
      }
    }        
  

    @AuraEnabled
    public final List<SObject> results;
    @AuraEnabled
    public final SObject firstResult;
  
    
  }   
  
  
  
  public class AggQueryResult {
    public AggQueryResult(List<AggregateResult> aggResult) {
      Decimal aggAmount = (Decimal)aggResult[0].get('expr0');
      this.aggAmount = aggAmount;
        //System.debug('AggQueryResult: ' + aggAmount);
    } 
      
    @AuraEnabled
    public final Decimal aggAmount;
  }

  public class SearchQueryResult {
    public SearchQueryResult(List<List<sObject>> searchResults) {
        this.searchResults = searchResults;
        
        if (searchResults != null && !searchResults.isEmpty()) {
            this.searchList0 = searchResults.get(0);
            
            if (searchResults.size() > 1) {
                this.searchList1 = searchResults.get(1);
            }
            
            if (this.searchList0 != null && !this.searchList0.isEmpty()) {
                this.firstSearchResult = this.searchList0.get(0);
            }
        }
    }
    
    @AuraEnabled
    public final List<List<SObject>> searchResults;
    @AuraEnabled
    public final List<SObject> searchList0; 
    @AuraEnabled
    public final SObject firstSearchResult;
    @AuraEnabled 
    public final List<sObject> searchList1;    
}
}
