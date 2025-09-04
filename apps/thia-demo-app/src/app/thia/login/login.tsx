"use client";

import { DisplayProvider } from "@pete_keen/thia-n-core";
import { useState } from "react";
import { loginAction } from "@/app/thia/login/action";
import { useFormStatus } from "react-dom";

export default function LoginForm({
	providers,
}: {
	providers: DisplayProvider[];
}) {
	const { pending } = useFormStatus();

	return (
		<div
			style={{
				height: "100vh",
				display: "flex",
				alignItems: "center",
				justifyContent: "center",
			}}
		>
			<form action={loginAction}>
				<div style={{ display: "inline-block" }}>
					<h1 style={{ textAlign: "center", fontSize: "22px" }}>
						Continue with
					</h1>
					{providers?.map((provider) => (
						<button
							key={provider.key}
							type="submit"
							name="provider"
							value={provider.key}
							disabled={pending}
							style={{
								width: "100%",
								display: "block",
								color: provider.style.text,
								backgroundColor: provider.style.bg,
								border: "none",
								borderRadius: "4px",
								padding: "12px 20px",
								marginBottom: "10px",
								cursor: "pointer",
								fontSize: "16px",

								transition: "all 0.2s ease",
							}}
						>
							{pending ? "Loading..." : provider.name}
						</button>
					))}
				</div>
			</form>
		</div>
	);
}
