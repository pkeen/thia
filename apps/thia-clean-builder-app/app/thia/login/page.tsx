export default function LoginPage() {
	return (
		<div
			style={{
				height: "100vh",
				display: "flex",
				alignItems: "center",
				justifyContent: "center",
			}}
		>
			<a
				href="/api/thia/login/github"
				style={{
					display: "inline-block",
					padding: "12px 20px",
					borderRadius: 4,
					background: "#24292f",
					color: "#fff",
					textDecoration: "none",
					fontSize: 16,
				}}
			>
				Continue with GitHub
			</a>
		</div>
	);
}
