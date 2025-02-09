import React, { useCallback, useEffect, useReducer, useState } from 'react';
import {
  Auth0Client,
  Auth0ClientOptions,
  CacheLocation,
  IdToken,
  LogoutOptions,
  LogoutUrlOptions,
  PopupLoginOptions,
  PopupConfigOptions,
  RedirectLoginOptions as Auth0RedirectLoginOptions,
  GetTokenWithPopupOptions,
  GetTokenSilentlyOptions,
  GetIdTokenClaimsOptions,
} from '@auth0/auth0-spa-js';
import Auth0Context, { RedirectLoginOptions } from './auth0-context';
import { hasAuthParams, loginError, tokenError } from './utils';
import { reducer } from './reducer';
import { initialAuthState } from './auth-state';
import { authorize } from './Auth0CordovaFork';

const DEFAULT_SCOPE = 'openid profile email';

// cloned from @auth0/auth0-spa-js
const dedupe = (arr: string[]) => Array.from(new Set(arr));
const getUniqueScopes = (...scopes: string[]) => {
  return dedupe(scopes.join(' ').trim().split(/\s+/)).join(' ');
};

/**
 * The state of the application before the user was redirected to the login page.
 */
export type AppState = {
  returnTo?: string;
  [key: string]: any; // eslint-disable-line @typescript-eslint/no-explicit-any
};

/**
 * The main configuration to instantiate the `Auth0Provider`.
 */
export interface Auth0ProviderOptions {
  /**
   * The child nodes your Provider has wrapped
   */
  children?: React.ReactNode;
  /**
   * By default this removes the code and state parameters from the url when you are redirected from the authorize page.
   * It uses `window.history` but you might want to overwrite this if you are using a custom router, like `react-router-dom`
   * See the EXAMPLES.md for more info.
   */
  onRedirectCallback?: (appState: AppState) => void;
  /**
   * By default, if the page url has code/state params, the SDK will treat them as Auth0's and attempt to exchange the
   * code for a token. In some cases the code might be for something else (another OAuth SDK perhaps). In these
   * instances you can instruct the client to ignore them eg
   *
   * ```jsx
   * <Auth0Provider
   *   clientId={clientId}
   *   domain={domain}
   *   skipRedirectCallback={window.location.pathname === '/stripe-oauth-callback'}
   * >
   * ```
   */
  skipRedirectCallback?: boolean;
  /**
   * Your Auth0 account domain such as `'example.auth0.com'`,
   * `'example.eu.auth0.com'` or , `'example.mycompany.com'`
   * (when using [custom domains](https://auth0.com/docs/custom-domains))
   */
  domain: string;
  /**
   * The issuer to be used for validation of JWTs, optionally defaults to the domain above
   */
  issuer?: string;
  /**
   * The Client ID found on your Application settings page
   */
  clientId: string;
  /**
   * The default URL where Auth0 will redirect your browser to with
   * the authentication result. It must be whitelisted in
   * the "Allowed Callback URLs" field in your Auth0 Application's
   * settings. If not provided here, it should be provided in the other
   * methods that provide authentication.
   */
  redirectUri?: string;
  /**
   * The value in seconds used to account for clock skew in JWT expirations.
   * Typically, this value is no more than a minute or two at maximum.
   * Defaults to 60s.
   */
  leeway?: number;
  /**
   * The location to use when storing cache data. Valid values are `memory` or `localstorage`.
   * The default setting is `memory`.
   *
   * Read more about [changing storage options in the Auth0 docs](https://auth0.com/docs/libraries/auth0-single-page-app-sdk#change-storage-options)
   */
  cacheLocation?: CacheLocation;
  /**
   * If true, refresh tokens are used to fetch new access tokens from the Auth0 server. If false, the legacy technique of using a hidden iframe and the `authorization_code` grant with `prompt=none` is used.
   * The default setting is `false`.
   *
   * **Note**: Use of refresh tokens must be enabled by an administrator on your Auth0 client application.
   */
  useRefreshTokens?: boolean;
  /**
   * A maximum number of seconds to wait before declaring background calls to /authorize as failed for timeout
   * Defaults to 60s.
   */
  authorizeTimeoutInSeconds?: number;
  /**
   * Changes to recommended defaults, like defaultScope
   */
  advancedOptions?: {
    /**
     * The default scope to be included with all requests.
     * If not provided, 'openid profile email' is used. This can be set to `null` in order to effectively remove the default scopes.
     *
     * Note: The `openid` scope is **always applied** regardless of this setting.
     */
    defaultScope?: string;
  };
  /**
   * Maximum allowable elapsed time (in seconds) since authentication.
   * If the last time the user authenticated is greater than this value,
   * the user must be reauthenticated.
   */
  maxAge?: string | number;
  /**
   * The default scope to be used on authentication requests.
   * The defaultScope defined in the Auth0Client is included
   * along with this scope
   */
  scope?: string;
  /**
   * The default audience to be used for requesting API access.
   */
  audience?: string;
  /**
   * If it's native capacitor/cordova app (iOS/Android), it will use IAB to log in
   */
  isNative: boolean;
  /**
   * If you need to send custom parameters to the Authorization Server,
   * make sure to use the original parameter name.
   */
  [key: string]: any; // eslint-disable-line @typescript-eslint/no-explicit-any
}

/**
 * Replaced by the package version at build time.
 * @ignore
 */
const __VERSION__ = '1.3.0';

/**
 * @ignore
 */
const toAuth0ClientOptions = (opts: Auth0ProviderOptions): Auth0ClientOptions => {
  const { clientId, redirectUri, maxAge, ...validOpts } = opts;
  return {
    ...validOpts,
    client_id: clientId,
    redirect_uri: redirectUri,
    max_age: maxAge,
    auth0Client: {
      name: 'auth0-react',
      version: __VERSION__,
    },
  };
};

/**
 * @ignore
 */
const toAuth0LoginRedirectOptions = (
  opts?: RedirectLoginOptions
): Auth0RedirectLoginOptions | undefined => {
  if (!opts) {
    return;
  }
  const { redirectUri, ...validOpts } = opts;
  return {
    ...validOpts,
    redirect_uri: redirectUri,
  };
};

/**
 * @ignore
 */
const defaultOnRedirectCallback = (appState?: AppState): void => {
  window.history.replaceState(
    {},
    document.title,
    appState?.returnTo || window.location.pathname
  );
};

/**
 * ```jsx
 * <Auth0Provider
 *   domain={domain}
 *   clientId={clientId}
 *   redirectUri={window.location.origin}>
 *   <MyApp />
 * </Auth0Provider>
 * ```
 *
 * Provides the Auth0Context to its child components.
 */
const Auth0Provider = (opts: Auth0ProviderOptions): JSX.Element => {
  const {
    children,
    skipRedirectCallback,
    onRedirectCallback = defaultOnRedirectCallback,
    ...clientOpts
  } = opts;
  const [client] = useState(() => new Auth0Client(toAuth0ClientOptions(clientOpts)));
  const [state, dispatch] = useReducer(reducer, initialAuthState);

  useEffect(() => {
    (async (): Promise<void> => {
      try {
        if (hasAuthParams() && !skipRedirectCallback) {
          const { appState } = await client.handleRedirectCallback();
          onRedirectCallback(appState);
        } else {
          await client.checkSession();
        }
        const user = await client.getUser();
        dispatch({ type: 'INITIALISED', user });
      } catch (error) {
        console.log({ error: error.toString() });
        dispatch({ type: 'ERROR', error: loginError(error) });
      }
    })();
  }, [client, onRedirectCallback, skipRedirectCallback]);

  const buildAuthorizeUrl = useCallback(
    (opts?: RedirectLoginOptions): Promise<string> =>
      client.buildAuthorizeUrl(toAuth0LoginRedirectOptions(opts)),
    [client]
  );

  const buildLogoutUrl = useCallback(
    (opts?: LogoutUrlOptions): string => client.buildLogoutUrl(opts),
    [client]
  );

  const nativeLogIn = useCallback(
    async (options?: RedirectLoginOptions): Promise<void> => {
      const url = await client.buildAuthorizeUrl(
        toAuth0LoginRedirectOptions(options)
      );
      authorize(url, (error: any, ok: any) => {
        console.log({ error, ok });
      });
    },
    [client]
  );

  const loginWithRedirect = useCallback(
    async (options?: RedirectLoginOptions): Promise<void> => {
      if (clientOpts.isNative) {
        await nativeLogIn(options);
      } else {
        await client.loginWithRedirect(toAuth0LoginRedirectOptions(options));
      }
    },
    [nativeLogIn, clientOpts.isNative, client]
  );

  const loginWithPopup = useCallback(
    async (
      options?: PopupLoginOptions,
      config?: PopupConfigOptions
    ): Promise<void> => {
      if (clientOpts.isNative) {
        await nativeLogIn(options);
      } else {
        dispatch({ type: 'LOGIN_POPUP_STARTED' });
        try {
          await client.loginWithPopup(options, config);
        } catch (error) {
          console.error({ error });
          dispatch({ type: 'ERROR', error: loginError(error) });
          return;
        }
        const user = await client.getUser();
        dispatch({ type: 'LOGIN_POPUP_COMPLETE', user });
      }
    },
    [nativeLogIn, client, clientOpts.isNative]
  );

  const logout = useCallback(
    (opts: LogoutOptions = {}): void => {
      client.logout(opts);
      if (opts.localOnly) {
        dispatch({ type: 'LOGOUT' });
      }
    },
    [client]
  );

  const userUpdatedAt = state.user?.updated_at;

  const getAccessTokenSilently = useCallback(
    async (opts?: GetTokenSilentlyOptions): Promise<string> => {
      let token;
      try {
        token = await client.getTokenSilently(opts);
      } catch (error) {
        throw tokenError(error);
      }
      const user = await client.getUser();
      if (user?.updated_at !== userUpdatedAt) {
        dispatch({ type: 'USER_UPDATED', user });
      }
      return token;
    },
    [client, userUpdatedAt]
  );

  const getAccessTokenWithPopup = useCallback(
    async (
      opts?: GetTokenWithPopupOptions,
      config?: PopupConfigOptions
    ): Promise<string> => {
      let token;
      try {
        token = await client.getTokenWithPopup(opts, config);
      } catch (error) {
        throw tokenError(error);
      }
      const user = await client.getUser();
      if (user?.updated_at !== userUpdatedAt) {
        dispatch({ type: 'USER_UPDATED', user });
      }
      return token;
    },
    [client, userUpdatedAt]
  );

  const tryGetAccessTokenWithPopupOrReLogin = useCallback(
    async (opts?: GetTokenWithPopupOptions): Promise<string | null> => {
      if (!clientOpts.isNative) {
        return getAccessTokenWithPopup(opts);
      }
      try {
        const options = { ...opts };
        options.audience = opts?.audience || clientOpts.audience;

        options.scope = getUniqueScopes(
          DEFAULT_SCOPE,
          options.scope || clientOpts.scope || DEFAULT_SCOPE
        );

        await nativeLogIn(options);
        return null;
      } catch (error) {
        throw tokenError(error);
      }
    },
    [clientOpts, nativeLogIn, getAccessTokenWithPopup]
  );

  const getIdTokenClaims = useCallback(
    (opts?: GetIdTokenClaimsOptions): Promise<IdToken> =>
      client.getIdTokenClaims(opts),
    [client]
  );

  return (
    <Auth0Context.Provider
      value={{
        ...state,
        buildAuthorizeUrl,
        buildLogoutUrl,
        getAccessTokenSilently,
        getAccessTokenWithPopup,
        getIdTokenClaims,
        loginWithRedirect,
        loginWithPopup,
        tryGetAccessTokenWithPopupOrReLogin,
        logout,
      }}
    >
      {children}
    </Auth0Context.Provider>
  );
};

export default Auth0Provider;
