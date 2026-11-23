# usage: api.sh path  (P-363: curl + gh auth token)
curl -sfL --retry 2 -H "Authorization: Bearer $(gh auth token)" -H "Accept: application/vnd.github+json" "https://api.github.com/$1"
