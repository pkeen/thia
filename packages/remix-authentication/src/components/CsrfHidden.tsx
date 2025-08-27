import { useAuthState } from "./AuthContext";

export const CsrfHidden = () => {
	const { csrf } = useAuthState();
	return <input type="hidden" name="csrfToken" value={csrf || ""} />;
};
