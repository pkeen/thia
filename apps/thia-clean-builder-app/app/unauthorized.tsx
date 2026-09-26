/** Rendered with a 401 status wherever unauthorized() is called. */
export default function Unauthorized() {
	return (
		<main style={{ padding: 32 }}>
			<h1>401 — Not signed in</h1>
			<p>
				You need to <a href="/thia/login">sign in</a> to view this page.
			</p>
		</main>
	);
}
