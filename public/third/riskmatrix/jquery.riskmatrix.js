(function($) {

    $.fn.createRiskMatrix = function( options ) {

		var settings = $.extend({
			OXName: "ВЕРОЯТНОСТЬ",
			OYName: "ВЛИЯНИЕ",
			Probability: [""], 
			Impact: [""],
			Color: [],
			Data: [{ Code: "", Name: "", Probability: "", Impact: "", CSS: "", URL: ""}] 

		}, options);


        return this.each( function() {
			
			// html with risk matrix
			var RiskMatrixHtml = "";
			
			// array with all combinations of Probability and Impact
			var table = new Array();
			
			// fill array
			for (i = 0; i < settings.Impact.length; i++) {
				table[settings.Impact[i]] = new Array();
				for (j = 0; j < settings.Probability.length; j++) {
					table[settings.Impact[i]][settings.Probability[j]] = "";
				}
			}

			// add to array items span with risk info by Probability and Impact
			for (i = 0; i < settings.Data.length; i++) {
				if (settings.Data[i].Code == "" && settings.Data.length == 1) {
					// do nothing                    		
				}
				else {
					table[settings.Data[i].Impact][settings.Data[i].Probability] += 
						"<span class='riskBadge " + settings.Data[i].CSS + "' onclick='location.href = \"" + settings.Data[i].URL + "\"'>" + settings.Data[i].Code + "</span>";
				}
			}

			
			// final matrix
			RiskMatrixHtml = "<table class='riskTable' cellspacing='0' cellpadding='0' width='100%' height='100%'>";
			
			// for every impact
			for (i = 0; i < settings.Impact.length; i++) {
				
				// open row for risk matrix
				RiskMatrixHtml += "<tr>";
				
				// create first column with OY Name in just first step
				if (i == 0) {
					RiskMatrixHtml += "<td class='riskRowLabel' rowspan='3'><div class='riskVert'>" + settings.OYName + "</div></td>";
				}
				
				// create second column with impact names 
				RiskMatrixHtml += "<td class='riskRowLabel'><div class='riskVert'>" + settings.Impact[settings.Impact.length - 1 - i] + "</div></td>";
				
				// for every probability add td with risk badges 
				for (j = 0; j < settings.Probability.length; j++) {
					RiskMatrixHtml += "<td class='riskCell " + settings.Color[settings.Impact.length - 1 - i + j] + "'>" + table[settings.Impact[settings.Impact.length - 1 - i]][settings.Probability[j]] + "</td>";
				}
				
				RiskMatrixHtml += "</tr>";
			}
			
			// add total count of risks
			RiskMatrixHtml += "<tr>";
			RiskMatrixHtml += "<td class='riskTotalLabel' colspan='2' rowspan='2'>" + settings.Data.length + "</td>";
			
			// add row with probability names
			for (j = 0; j < settings.Probability.length; j++) {
				RiskMatrixHtml += "<td class='riskColLabel'>" + settings.Probability[j] + "</td>";
			}
			RiskMatrixHtml += "</tr>";	
			
			// OX Name
			RiskMatrixHtml += "<tr>";
			RiskMatrixHtml += "<td class='riskColLabel' colspan='3'>" + settings.OXName + "</td>";
			RiskMatrixHtml += "</tr>";

			RiskMatrixHtml += "</table>";

			jQuery(this).empty();
			jQuery(this).append(RiskMatrixHtml);
        });
    }
}(jQuery));