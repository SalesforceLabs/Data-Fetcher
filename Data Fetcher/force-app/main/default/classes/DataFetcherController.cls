/**
 * @description       : 
 * @author            : Josh Dayment
 * @group             : 
 * @last modified on  : 06-23-2023
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
          System.debug('AggQueryResult: ' + aggAmount);
      } 
        
      @AuraEnabled
      public final Decimal aggAmount;
    }  
  }
