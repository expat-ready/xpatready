curl -sfL -H "Authorization: Bearer $(gh auth token)" "https://api.github.com/repos/expat-ready/xpatready/actions/jobs/$1/logs"
