use std::collections::{HashMap, HashSet, VecDeque};
use std::error::Error;

pub fn topological_sort(
    nodes: &[String],
    edges: &HashMap<String, HashSet<String>>,
) -> Result<Vec<String>, Box<dyn Error>> {
    let node_set: HashSet<&String> = nodes.iter().collect();

    let mut in_degree: HashMap<&String, usize> = HashMap::new();
    for node in nodes {
        in_degree.insert(node, 0);
    }

    // Invert edges: dependency -> list of dependents
    let mut forward: HashMap<&String, Vec<&String>> = HashMap::new();
    for node in nodes {
        forward.insert(node, Vec::new());
    }

    for (node, deps) in edges {
        if !node_set.contains(node) {
            continue;
        }
        for dep in deps {
            if node_set.contains(dep) {
                forward.get_mut(dep).unwrap().push(node);
                *in_degree.get_mut(node).unwrap() += 1;
            }
        }
    }

    let mut queue: VecDeque<&String> = VecDeque::new();
    for (node, &degree) in &in_degree {
        if degree == 0 {
            queue.push_back(node);
        }
    }

    let mut sorted_queue: Vec<&String> = queue.drain(..).collect();
    sorted_queue.sort();
    queue.extend(sorted_queue);

    let mut result = Vec::new();

    while let Some(node) = queue.pop_front() {
        result.push(node.clone());

        let mut next_nodes: Vec<&String> = Vec::new();
        for dependent in &forward[node] {
            let deg = in_degree.get_mut(dependent).unwrap();
            *deg -= 1;
            if *deg == 0 {
                next_nodes.push(dependent);
            }
        }
        next_nodes.sort();
        queue.extend(next_nodes);
    }

    if result.len() != nodes.len() {
        let missing: Vec<String> = nodes
            .iter()
            .filter(|n| !result.contains(n))
            .cloned()
            .collect();
        return Err(format!("Circular dependency detected involving: {}", missing.join(", ")).into());
    }

    Ok(result)
}

pub fn transitive_dependents(
    changed: &HashSet<String>,
    all_nodes: &[String],
    edges: &HashMap<String, HashSet<String>>,
) -> HashSet<String> {
    let mut reverse: HashMap<&String, Vec<&String>> = HashMap::new();
    for node in all_nodes {
        reverse.insert(node, Vec::new());
    }
    for (node, deps) in edges {
        for dep in deps {
            if let Some(dependents) = reverse.get_mut(dep) {
                dependents.push(node);
            }
        }
    }

    let mut affected: HashSet<String> = changed.clone();
    let mut queue: VecDeque<String> = changed.iter().cloned().collect();

    while let Some(node) = queue.pop_front() {
        if let Some(dependents) = reverse.get(&node) {
            for dep in dependents {
                if affected.insert((*dep).clone()) {
                    queue.push_back((*dep).clone());
                }
            }
        }
    }

    affected
}

#[cfg(test)]
mod dag_tests {
    use super::*;

    fn s(x: &str) -> String {
        x.to_string()
    }

    fn edge_map(pairs: &[(&str, &[&str])]) -> HashMap<String, HashSet<String>> {
        pairs
            .iter()
            .map(|(node, deps)| {
                (
                    s(node),
                    deps.iter().map(|d| s(d)).collect::<HashSet<String>>(),
                )
            })
            .collect()
    }

    fn position(v: &[String], name: &str) -> usize {
        v.iter().position(|n| n == name).expect("node missing from sort output")
    }

    #[test]
    fn topological_sort_orders_dependencies_before_dependents() {
        let nodes = vec![s("a"), s("b"), s("c")];
        // c depends on b; b depends on a. Expected order: a, b, c.
        let edges = edge_map(&[("b", &["a"]), ("c", &["b"])]);
        let sorted = topological_sort(&nodes, &edges).unwrap();
        assert_eq!(sorted.len(), 3);
        assert!(position(&sorted, "a") < position(&sorted, "b"));
        assert!(position(&sorted, "b") < position(&sorted, "c"));
    }

    #[test]
    fn topological_sort_includes_disconnected_components() {
        // a -> b plus standalone c — all three appear.
        let nodes = vec![s("a"), s("b"), s("c")];
        let edges = edge_map(&[("b", &["a"])]);
        let sorted = topological_sort(&nodes, &edges).unwrap();
        assert_eq!(sorted.len(), 3);
        let mut as_set: HashSet<String> = sorted.iter().cloned().collect();
        assert!(as_set.remove("a"));
        assert!(as_set.remove("b"));
        assert!(as_set.remove("c"));
        assert!(as_set.is_empty());
    }

    #[test]
    fn topological_sort_returns_error_on_cycle() {
        // a depends on b; b depends on a — cycle.
        let nodes = vec![s("a"), s("b")];
        let edges = edge_map(&[("a", &["b"]), ("b", &["a"])]);
        let err = topological_sort(&nodes, &edges)
            .expect_err("cycle should surface as Err");
        // The implementation returns a Box<dyn Error> built from a String;
        // the message must name both nodes involved in the cycle.
        let msg = err.to_string();
        assert!(msg.contains("Circular dependency"), "got: {msg}");
        assert!(msg.contains("a"), "cycle message should mention 'a': {msg}");
        assert!(msg.contains("b"), "cycle message should mention 'b': {msg}");
    }

    #[test]
    fn topological_sort_ignores_edges_to_unknown_nodes() {
        // Edge from "a" to "ghost" (not in node list) must not stop "a" from
        // becoming a root — otherwise it would be treated as having in-degree 1.
        let nodes = vec![s("a")];
        let edges = edge_map(&[("a", &["ghost"])]);
        let sorted = topological_sort(&nodes, &edges).unwrap();
        assert_eq!(sorted, vec![s("a")]);
    }

    #[test]
    fn transitive_dependents_walks_reverse_edges() {
        // a -> b -> c; if a changes, both b and c are affected (plus a itself).
        let nodes = vec![s("a"), s("b"), s("c")];
        let edges = edge_map(&[("b", &["a"]), ("c", &["b"])]);
        let mut changed = HashSet::new();
        changed.insert(s("a"));
        let affected = transitive_dependents(&changed, &nodes, &edges);
        let mut got: Vec<String> = affected.into_iter().collect();
        got.sort();
        assert_eq!(got, vec![s("a"), s("b"), s("c")]);
    }

    #[test]
    fn transitive_dependents_leaves_unrelated_nodes_alone() {
        // a -> b; standalone c. Changing c affects only c.
        let nodes = vec![s("a"), s("b"), s("c")];
        let edges = edge_map(&[("b", &["a"])]);
        let mut changed = HashSet::new();
        changed.insert(s("c"));
        let affected = transitive_dependents(&changed, &nodes, &edges);
        assert_eq!(affected.len(), 1);
        assert!(affected.contains("c"));
    }
}
