(function () {
	var memberOf = {
		Nu: {
			FLOT_NBT: 1,
			FLOT_NSR: 2,
			FLOT_BTC: 3
		}
	}
	
	var known = {
		pubKey: {
			// "pubkey": {name:"John Doe"},
			
			// Developer
			"02113443efda4a9fe9bd38ca1f932aaee2c3cb6ee637f22eaa25af370a1cde6952": {name:"Developer", email:"ttutdxh.nubits@gmail.com", fee:1},
		},
		scriptHash: {
			// Nu FLOT addresses scripthash. // Commented with redeemScript.
			"f716edbaa472c1470d36a3e78b17a4c9bb547fcf": {name:"Nu FLOT BTC group 1st address", deprecated:true},           // 55210234139729dd413c84a71a0bfd6f236790be861b37311cef3240277c940e4b0c072102435b894b94b4b27dd24436b3f9ad0b9409d855ab4be6e91141d445804e84750b2102e2fcdfe246e9cd4864d9119b8af465487385eccd0ea30a8cb21d44d36818189f210312cd6eb361c9ebb0d90e44946492a237eab4c7a7d88a0db800f2f460937cc22f21034b0bd0f653d4ac0a2e9e81eb1863bb8e5743f6cb1ea40d845b939c225a1a80ff2103661a4370dfcfbcea25d1800057220f4572b6eecab95bb0670e8676a9e34451dc2103a5fc09a5de595e4758bfbc3a932e2c448cc49a557dd6e64788cee530a76225212103da8082062298c40f0b473b74f3c95b57eaaebe3e67ed30ce56347b2e727915fb58ae
			"afd5c3c6fb0c40799f0a874396df7bfce2bc29a3": {name:"Nu FLOT BTC group 2nd address"},                            // 55210234139729dd413c84a71a0bfd6f236790be861b37311cef3240277c940e4b0c072102435b894b94b4b27dd24436b3f9ad0b9409d855ab4be6e91141d445804e84750b2102e2fcdfe246e9cd4864d9119b8af465487385eccd0ea30a8cb21d44d36818189f210312cd6eb361c9ebb0d90e44946492a237eab4c7a7d88a0db800f2f460937cc22f210326c19862fb329470c828ace6749b64c50b4d9a8da60d60e4e32ebe96b388b2ae21034b0bd0f653d4ac0a2e9e81eb1863bb8e5743f6cb1ea40d845b939c225a1a80ff2103661a4370dfcfbcea25d1800057220f4572b6eecab95bb0670e8676a9e34451dc2103da8082062298c40f0b473b74f3c95b57eaaebe3e67ed30ce56347b2e727915fb58ae

			"f35b24f264597d66ba8c366a5005824bb6a06138": {name:"Nu FLOT NBT group 1st address"},                            // 5321034b0bd0f653d4ac0a2e9e81eb1863bb8e5743f6cb1ea40d845b939c225a1a80ff2102a144af74d018501f03d76ead130433335f969772792ec39ce389c8a2341552592103661a4370dfcfbcea25d1800057220f4572b6eecab95bb0670e8676a9e34451dc210234139729dd413c84a71a0bfd6f236790be861b37311cef3240277c940e4b0c072102547427fc2ea3a0ab9ef70f5e1640ff5112b113f65696948f992bd0770b94257155ae
			
			"d4f1e97d23cf339c35b509de707acdcb9886e03b": {name:"Nu FLOT NSR group provisional address", deprecated:true},     // 53210234139729dd413c84a71a0bfd6f236790be861b37311cef3240277c940e4b0c072102a144af74d018501f03d76ead130433335f969772792ec39ce389c8a2341552592103661a4370dfcfbcea25d1800057220f4572b6eecab95bb0670e8676a9e34451dc2103686ee42f635c71c08f326e66139b6cb37167402cc0562584655aac03fe74049521039854d0e2abf6e4971e1350137b876da6a05132737c11ca3e37aaed2a0eb6680855ae
			"7077487df91c0166d33ee6079b0c2229788f6ac2": {name:"Nu FLOT NSR group 1st address"},                            // 532102e2fcdfe246e9cd4864d9119b8af465487385eccd0ea30a8cb21d44d36818189f2103661a4370dfcfbcea25d1800057220f4572b6eecab95bb0670e8676a9e34451dc2103686ee42f635c71c08f326e66139b6cb37167402cc0562584655aac03fe74049521039854d0e2abf6e4971e1350137b876da6a05132737c11ca3e37aaed2a0eb668082103d05d8fb69fcd289548140dde8e906f6fc217b02477f81842f2483d9ea1c9242555ae
		},
		identities: { // id.pubkey{memberof, [deprecated]}
			"cryptog": {
				"02435b894b94b4b27dd24436b3f9ad0b9409d855ab4be6e91141d445804e84750b": {
					member: [
						memberOf.Nu.FLOT_BTC  // https://discuss.nubits.com/t/via-quote/3098/15
					]
				},
				"03686ee42f635c71c08f326e66139b6cb37167402cc0562584655aac03fe740495": {
					member: [
						memberOf.Nu.FLOT_NSR  // https://discuss.nubits.com/t/via-quote/3103/20
					]
				},
			},
			"Dhume": {
				"02e2fcdfe246e9cd4864d9119b8af465487385eccd0ea30a8cb21d44d36818189f": {
					member: [
						memberOf.Nu.FLOT_BTC, // https://discuss.nubits.com/t/via-quote/3098/10
						memberOf.Nu.FLOT_NSR  // https://discuss.nubits.com/t/via-quote/3103/14
					]
				}
			},
			"dysconnect": {
				"034b0bd0f653d4ac0a2e9e81eb1863bb8e5743f6cb1ea40d845b939c225a1a80ff": {
					member: [
						memberOf.Nu.FLOT_BTC, // https://discuss.nubits.com/t/via-quote/3098/16
						memberOf.Nu.FLOT_NBT  // https://discuss.nubits.com/t/via-quote/2902/167
					]
				}
			},
			"jooize": {
				"0234139729dd413c84a71a0bfd6f236790be861b37311cef3240277c940e4b0c07": {
					member: [
						memberOf.Nu.FLOT_BTC, // https://discuss.nubits.com/t/via-quote/3098/13
						memberOf.Nu.FLOT_NBT  // https://discuss.nubits.com/t/via-quote/2902/170
					]
				}
			},
			"masterOfDisaster": {
				"0312cd6eb361c9ebb0d90e44946492a237eab4c7a7d88a0db800f2f460937cc22f": {
					member: [
						memberOf.Nu.FLOT_BTC  // https://discuss.nubits.com/t/via-quote/3098/12
					]
				},
				"02a144af74d018501f03d76ead130433335f969772792ec39ce389c8a234155259": {
					member: [
						memberOf.Nu.FLOT_NBT  // https://discuss.nubits.com/t/via-quote/2902/168
					]
				},
				"03d05d8fb69fcd289548140dde8e906f6fc217b02477f81842f2483d9ea1c92425": {
					member: [
						memberOf.Nu.FLOT_NSR  // https://discuss.nubits.com/t/via-quote/3103/1
					]
				}
			},
			"mhps": {
				"03a5fc09a5de595e4758bfbc3a932e2c448cc49a557dd6e64788cee530a7622521": {
				deprecated: true, // https://discuss.nubits.com/t/flot-operations-buy-side-btc-related/3117/168
				member: [
						memberOf.Nu.FLOT_BTC  // https://discuss.nubits.com/t/via-quote/3098/14
					]
				},
				"0326c19862fb329470c828ace6749b64c50b4d9a8da60d60e4e32ebe96b388b2ae": {
					member: [
						memberOf.Nu.FLOT_BTC  // https://discuss.nubits.com/t/via-quote/3098/14
					]
				},
				"039854d0e2abf6e4971e1350137b876da6a05132737c11ca3e37aaed2a0eb66808": {
					member: [
						memberOf.Nu.FLOT_NSR  // https://discuss.nubits.com/t/via-quote/3103/9
					]
				}
			},
			"ttutdxh": {
				"03661a4370dfcfbcea25d1800057220f4572b6eecab95bb0670e8676a9e34451dc": {
					member: [
						memberOf.Nu.FLOT_BTC, // https://discuss.nubits.com/t/via-quote/3098/9
						memberOf.Nu.FLOT_NBT, // https://discuss.nubits.com/t/via-quote/2902/169
						memberOf.Nu.FLOT_NSR  // https://discuss.nubits.com/t/via-quote/3103/6
					]
				}
			},
			"woodstockmerkle": {
				"03da8082062298c40f0b473b74f3c95b57eaaebe3e67ed30ce56347b2e727915fb": {
					member: [
						memberOf.Nu.FLOT_BTC  // https://discuss.nubits.com/t/via-quote/3098/11
					]
				},
				"02547427fc2ea3a0ab9ef70f5e1640ff5112b113f65696948f992bd0770b942571": {
					member: [
						memberOf.Nu.FLOT_NBT  // https://discuss.nubits.com/t/via-quote/2902/171
					]
				}
			}
		}
	};
	

	for (var id in known.identities) { // Compute pubkey list
		for (var pubkey in known.identities[id]) {
			
			// FLOT memberOfs
			var FLOT = [];
			for (var group in known.identities[id][pubkey].member) {
				if (known.identities[id][pubkey].member[group] == memberOf.Nu.FLOT_BTC) FLOT.push("BTC");
				if (known.identities[id][pubkey].member[group] == memberOf.Nu.FLOT_NBT) FLOT.push("NBT");
				if (known.identities[id][pubkey].member[group] == memberOf.Nu.FLOT_NSR) FLOT.push("NSR");
			}
			if (FLOT.length > 0) {
				var prefix = (known.identities[id][pubkey].deprecated)?"DEPRECATED ":"";
				known.pubKey[pubkey] = {
					name: prefix + "Nu FLOT @"+ id + " " +(FLOT.join(", ")),
					email: "<contact directly>",
					fee: ""
				}
			}
		}
	}
	
	// Mark deprecated. Handling will change in the future. Maybe an alert.
	for (var hash in known.scriptHash) {
		known.scriptHash[hash].name = (known.scriptHash[hash].deprecated)?"DEPRECATED " + known.scriptHash[hash].name:known.scriptHash[hash].name;
	}
	
	window['known'] = known;
})();

console.log("Loaded known identities", known);
