const providers = [
	{ key: "github", name: "GitHub", text: "#fff", bg: "#24292f" },
	{ key: "google", name: "Google", text: "#3c4043", bg: "#fff" },
];

export default function LoginPage() {
	return (
		<div
			style={{
				height: "100vh",
				display: "flex",
				flexDirection: "column",
				gap: 12,
				alignItems: "center",
				justifyContent: "center",
			}}
		>
			{providers.map((provider) => (
				<a
					key={provider.key}
					href={`/api/thia/login/${provider.key}`}
					style={{
						display: "inline-block",
						width: 220,
						textAlign: "center",
						padding: "12px 20px",
						borderRadius: 4,
						background: provider.bg,
						color: provider.text,
						border:
							provider.bg === "#fff" ? "1px solid #dadce0" : "none",
						textDecoration: "none",
						fontSize: 16,
					}}
				>
					Continue with {provider.name}
				</a>
			))}
		</div>
	);
}
