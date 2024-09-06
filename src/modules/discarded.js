const url = location.search.substring(1);
document.title = url;
document.addEventListener('visibilitychange', () => {
	if (document.visibilityState === 'visible') {
		location.href = url;
	}
});

