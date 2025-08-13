export function fractionalBetween(left, right) {
	if (left != null && right != null) return (Number(left) + Number(right)) / 2;
	if (left == null && right != null) return Number(right) - 1;
	if (left != null && right == null) return Number(left) + 1;
	return 0;
}


