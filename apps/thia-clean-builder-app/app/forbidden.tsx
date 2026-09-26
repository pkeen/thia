/** Rendered with a 403 status wherever forbidden() is called. */
export default function Forbidden() {
	return (
		<main style={{ padding: 32 }}>
			<h1>403 — Forbidden</h1>
			<p>Your account does not have permission to view this page.</p>
			<a href="/">Back</a>
		</main>
	);
}
