import { Form, useNavigation } from "react-router"; // or "react-router-dom" if that's what you use
import type { DisplayProvider } from "@pete_keen/authentication-core";
import { useState, useEffect } from "react";
import { useSubmit } from "react-router";

export function Login({ providers }: { providers: DisplayProvider[] }) {
	const submit = useSubmit();

	useEffect(() => {
		console.log("Login component mounted on the client");
	}, []);
	// const isNavigating = Boolean(navigation.location);

	// State to track the provider that was clicked
	const [selectedProvider, setSelectedProvider] = useState("");

	const [hover, setHover] = useState(false);

	return (
		<div
			style={{
				// height: "100%",
                height: "100vh",
				display: "flex",
				alignItems: "center",
				justifyContent: "center",
				border: "1px solid red",
				flex: 1,
			}}
		>
			<form method="post" data-turbo="false">
				{/* {isSubmitting ? (
					// Show a loading message once a button is clicked and submission starts
					<div style={{ textAlign: "center" }}>
						<h2>Signing in with {selectedProvider}...</h2>
						<p>Please wait while we redirect you.</p>
					</div>
				) : ( */}
				{/* // Otherwise, show all the login buttons */}
				<div style={{ display: "inline-block" }}>
					<h1
						style={{
							textAlign: "center",
							fontSize: "22px",
                            marginBottom: "10px",
							// border: "1px solid red",
						}}
					>
						Continue with
					</h1>
					{providers?.map((provider) => (
						<button
							key={provider.key}
							type="submit"
							name="provider"
							value={provider.key}
							onClick={() => {
								setSelectedProvider(provider.name);
								// setIsSubmitting(true);
							}}
							onMouseEnter={() => setHover(true)}
							onMouseLeave={() => setHover(false)}
							// disabled={isSubmitting} // disable the buttons while submitting
							style={{
								width: "100%",
								display: "block",
								color: provider.style.text,
								backgroundColor: provider.style.bg,
								// border: "none",
								borderRadius: "4px",
								padding: "12px 20px",
								marginBottom: "10px",
								cursor: "pointer",
								// cursor: isSubmitting
								// 	? "not-allowed"
								// 	: "pointer",
								fontSize: "16px",

								transition: "all 0.2s ease",
								// border: "1px solid red",
								// margin: "10px",
								// border: hover ? "1px solid black" : "none"
							}}
						>
							{provider.name}
						</button>
					))}
				</div>
				{/* )} */}
			</form>
		</div>
	);
}
