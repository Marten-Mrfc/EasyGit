import type { FormState, FormAction } from "./types";

export const initialFormState: FormState = {
  selectedType: null,
  scope: "",
  breakingBang: false,
  breakingFooter: "",
  description: "",
  body: "",
  bodyOpen: false,
  footers: "",
  footerOpen: false,
  amend: false,
};

export function formReducer(state: FormState, action: FormAction): FormState {
  switch (action.type) {
    case "SET_TYPE":
      return { ...state, selectedType: action.payload };
    case "SET_SCOPE":
      return { ...state, scope: action.payload };
    case "SET_BREAKING_BANG":
      return { ...state, breakingBang: action.payload };
    case "SET_BREAKING_FOOTER":
      return { ...state, breakingFooter: action.payload };
    case "SET_DESCRIPTION":
      return { ...state, description: action.payload };
    case "SET_BODY":
      return { ...state, body: action.payload };
    case "SET_BODY_OPEN":
      return { ...state, bodyOpen: action.payload };
    case "SET_FOOTERS":
      return { ...state, footers: action.payload };
    case "SET_FOOTER_OPEN":
      return { ...state, footerOpen: action.payload };
    case "SET_AMEND":
      return { ...state, amend: action.payload };
    case "FILL_FROM_COMMIT":
      return { ...state, ...action.payload };
    case "RESET":
      return initialFormState;
    default:
      return state;
  }
}
