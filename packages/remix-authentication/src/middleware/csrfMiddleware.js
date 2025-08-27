export async function csrfMiddleware(request, sessionCsrf, formData) {
    const safeMethods = ["GET", "HEAD", "OPTIONS"];
    console.log("csrfMiddleware - request.method: ", request.method);
    console.log("csrfMiddleware - exiting", safeMethods.includes(request.method));
    if (safeMethods.includes(request.method))
        return; // Skip safe methods
    const incomingCsrf = (formData === null || formData === void 0 ? void 0 : formData.get("csrfToken")) || request.headers.get("X-CSRF-Token");
    console.log("csrfMiddleware - incomingCsrf: ", incomingCsrf);
    console.log("csrfMiddleware - sessionCsrf: ", sessionCsrf);
    if (!incomingCsrf || incomingCsrf !== sessionCsrf) {
        throw new Response(JSON.stringify({ error: "Invalid CSRF token" }), {
            status: 403,
            headers: { "Content-Type": "application/json" },
        });
    }
}
