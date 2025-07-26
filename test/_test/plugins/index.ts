


function  test_dbquery5() {
        console.log("USER WORKER Example");
        const dbm = Trex.databaseManager();
        console.log(dbm.getDatabases())
        console.log(dbm.getDatabaseCredentials())
        const conn = dbm.getConnection('demo_database', 'demo_cdm', "demo_cdm", {"duckdb": 
        (sql:string,
            schemaName:string,
            vocabSchemaName:string,
            parameters:any) => {
                //translate hana sql to duckdb sql
            return sql;
        }})

        const res = conn.execute("select count(1) from $$SCHEMA$$.person where person_id < ?",[{value:4000}], ((err:any,res:any) => {
            console.log(res);
            console.log(err);

        }));
        //res.then((r) => console.log(r)).catch((e) => console.error(e));
    
}

test_dbquery5()

function  test_atlas() {
        console.log("ATLAS USER WORKER Example");
        const dbm = Trex.databaseManager();
        console.log(dbm.getDatabases())
        console.log(dbm.getDatabaseCredentials())
        const conn = dbm.getConnection('demo_database', 'demo_cdm', "demo_cdm", {"duckdb": 
        (sql:string,
            schemaName:string,
            vocabSchemaName:string,
            parameters:any) => {
                //translate hana sql to duckdb sql
            return sql;
        }})

        // Use the exact JSON structure from CIRCE Rust tests - clean format
        const cohortJson = {
            "title": "Complete Test Cohort",
            "primaryCriteria": {
                "criteriaList": [{
                    "ConditionOccurrence": {
                        "CodesetId": 1,
                        "First": true,
                        "OccurrenceStartDate": {
                            "Value": "2020-01-01",
                            "Op": "gte"
                        }
                    }
                }],
                "observationWindow": {
                    "priorDays": 365,
                    "postDays": 0
                },
                "primaryLimit": {
                    "type": "First"
                }
            },
            "conceptSets": [{
                "id": 1,
                "name": "Diabetes Condition Set",
                "expression": {
                    "items": [{
                        "concept": {
                            "conceptId": 201826,
                            "conceptName": "Type 2 diabetes mellitus",
                            "standardConcept": "S",
                            "invalidReason": "V",
                            "conceptCode": "E11",
                            "domainId": "Condition",
                            "vocabularyId": "ICD10CM",
                            "conceptClassId": "3-char billing code"
                        },
                        "isExcluded": false,
                        "includeDescendants": true,
                        "includeMapped": false
                    }]
                }
            }],
            "qualifiedLimit": {"type": "First"},
            "expressionLimit": {"type": "First"},
            "inclusionRules": [],
            "collapseSettings": {"collapseType": "ERA", "eraPad": 0}
        };
        
        const res = conn.atlas(JSON.stringify(cohortJson), ((err:any,res:any) => {
            console.log("Result:", res);
            console.log("Error:", err);
            
            // If there's an error, it might be a JSON parsing issue
            if (err && err.message && err.message.includes("JSON")) {
                console.log("JSON parsing error detected. This suggests the CIRCE result contains invalid JSON or control characters.");
            }
        })); 
        //res.then((r) => console.log(r)).catch((e) => console.error(e));
    
}

test_atlas()