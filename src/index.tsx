export { default as Auth0Provider } from './auth0-provider';
export type { Auth0ProviderOptions, AppState } from './auth0-provider';
export { default as useAuth0 } from './use-auth0';
export { default as withAuth0 } from './with-auth0';
export type { WithAuth0Props } from './with-auth0';
export { default as withAuthenticationRequired } from './with-authentication-required';
export type { WithAuthenticationRequiredOptions } from './with-authentication-required';
export { default as Auth0Context } from './auth0-context';
export type { Auth0ContextInterface, RedirectLoginOptions } from './auth0-context';
export type {
  PopupLoginOptions,
  PopupConfigOptions,
  GetIdTokenClaimsOptions,
  GetTokenWithPopupOptions,
  LogoutOptions,
  LogoutUrlOptions,
  CacheLocation,
  GetTokenSilentlyOptions,
  IdToken,
} from '@auth0/auth0-spa-js';
export { OAuthError } from './errors';
