function SearchResults({ query }) {
  const [results, setResults] = useState([]);

  useEffect(() => {
    fetch("/api/search?q=" + query)
      .then(r => r.json())
      .then(setResults);
  }, [query]);

  return (
    <ul>
      {results.map(r => <li key={r.id}>{r.name}</li>)}
    </ul>
  );
}
