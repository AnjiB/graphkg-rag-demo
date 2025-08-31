from neo4j import GraphDatabase

driver = GraphDatabase.driver("bolt://localhost:7687", auth=("neo4j", "test"))

def create_node(tx, label, name):
    tx.run(f"MERGE (n:{label} {{name: $name}})", name=name)

def create_edge(tx, from_node, to_node, rel_type):
    tx.run(
        f"""
        MATCH (a {{name: $from_name}}), (b {{name: $to_name}})
        MERGE (a)-[r:{rel_type}]->(b)
        """,
        from_name=from_node, to_name=to_node
    )

def add_concepts(concepts):
    with driver.session() as session:
        for concept in concepts:
            session.write_transaction(create_node, "Concept", concept)
        for i in range(len(concepts)-1):
            session.write_transaction(create_edge, concepts[i], concepts[i+1], "RELATED_TO")