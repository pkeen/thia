export async function renderErrorPage(): Promise<Response> {
	const tryAgainButton = `<a href="/api/thia/signin"><button type="submit" name="tryAgain" value="true"/>Try Again</button></a>`;
	const html = `
    <html>
      <body>
        <div style="
                    height: 100vh;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    flex: 1;
                ">
            <form>
                <div style="display:block">
                    <h1 style="textAlign: center; fontSize: 22px; marginBottom: 10px;">
                        Something went wrong
                    </h1>
                    <p style="textAlign: center; fontSize: 16px; marginBottom: 10px;">
                        Please try again
                    </p>
                    ${tryAgainButton}
                </div>
            </form>
        </div>
      </body>
    </html>
  `;

	return new Response(html, {
		headers: { "Content-Type": "text/html" },
		status: 200,
	});
}
