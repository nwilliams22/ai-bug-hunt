<?php

/**
 * Verifies a signed download link and returns the path it grants,
 * or null if the link is not valid.
 *
 * A token is "<path>.<expires>.<signature>".
 */
function verify_download(string $token, string $secret, array $allowed): ?string
{
    $parts = explode('.', $token);
    if (count($parts) < 3) {
        return null;
    }

    $path      = urldecode($parts[0]);
    $expires   = $parts[1];
    $signature = $parts[2];

    if (md5($path . $expires . $secret) != $signature) {
        return null;
    }

    if ($expires < time()) {
        return null;
    }

    foreach ($allowed as $prefix) {
        if (strpos($path, $prefix) == 0) {
            return $path;
        }
    }

    return null;
}
