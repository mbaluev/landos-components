if (typeof BubbleChart === 'undefined') {
    var BubbleChart = (function(){
        function BubbleChart(containerid, data){
            this.containerid = containerid;
            this.data = data;
            this.forceStrength = 0.03;
            this.m_timer = null;

            this.svg = null;
            this.bubbles = null;
            this.nodes = [];

            this.max_radius = 80;
            this.min_radius = 2;
            this.fill_color = d3.scaleOrdinal().domain(["low", "medium", "high", 3, 2, 0]).range(["#ff6666", "#00a1f4", "#3cd79a", "#ff6666", "#00a1f4", "#3cd79a"]);
            this.max_amount = d3.max(this.data, function(d){ return +d.total_amount; });
            this.radius_scale = d3.scalePow().exponent(0.5).domain([0, this.max_amount]).range([this.min_radius, this.max_radius]);
            this.total_square = 0;
            this.data.forEach((function(_this){
                return function(d){
                    var radius = _this.radius_scale(parseInt(d.total_amount));
                    _this.total_square += Math.PI * radius * radius;
                    return _this.total_square;
                };
            })(this));
            this.total_radius = Math.sqrt(this.total_square * 2 / Math.PI);

            this.resize_nodes();
            this.create_simulation();
            this.create_nodes();
            this.create_vis();
            this.restart_vis();
            this.bind_resize();
        }
        BubbleChart.prototype.resize_nodes = function(){
            this.width = $(this.containerid).outerWidth();
            this.height = $(this.containerid).outerHeight();
            this.center = {
                x: this.width / 2,
                y: this.height / 2
            };
            this.max_radius = ( Math.min(this.width, this.height) / 2 ) * 80 / this.total_radius;
            this.radius_scale = d3.scalePow().exponent(0.5).domain([0, this.max_amount]).range([this.min_radius, this.max_radius]);
            this.nodes.forEach((function (_this) {
                return function (d) {
                    d.radius = _this.radius_scale(parseInt(d.value));
                };
            })(this));
        };
        BubbleChart.prototype.create_nodes = function(){
            var self = this;
            var nodes = self.data.map(function(d){
                return {
                    id: d.id,
                    radius: self.radius_scale(parseInt(d.total_amount)),
                    value: +d.total_amount,
                    group: d.group,
                    projectid: d.projectid,
                    projectname: d.projectname,
                    projectcode: d.projectcode,
                    contractscount: d.contractscount,
                    x: Math.random() * self.width,
                    y: Math.random() * self.height
                };
            });
            nodes.sort(function (a, b) { return b.value - a.value; });
            self.nodes = nodes;
        }
        BubbleChart.prototype.create_simulation = function(){
            var self = this;
            self.simulation = d3.forceSimulation().velocityDecay(0.2).on('tick', ticked);
            self.simulation.stop();
            function ticked(){
                self.bubbles
                    .attr('cx', function(d){ return d.x; })
                    .attr('cy', function(d){ return d.y; });
            }
        };
        BubbleChart.prototype.create_vis = function(){
            var self = this;
            self.svg = d3.select(self.containerid)
                .append('svg')
                .attr('width', self.width)
                .attr('height', self.height);

            self.bubbles = self.svg.selectAll('.bubble').data(self.nodes, function(d){ return d.id; });

            var bubble = self.bubbles.enter().append('circle')
                .classed('bubble', true)
                .attr("id", function(d) { return d.id; })
                .attr('r', 0)
                .attr('fill', function (d) { return self.fill_color(d.group); })
                .attr('stroke', function (d) { return d3.rgb(self.fill_color(d.group)).darker(0.25); })
                .attr('stroke-width', 2)
                .on("mouseover", function (d, i) {
                    return self.bubble_mouseover(d, i, this);
                })
                .on("mouseout", function (d, i) {
                    return self.bubble_mouseout(d, i, this);
                });

            self.bubbles = self.bubbles.merge(bubble);
            self.bubbles.transition().duration(2000).attr('r', function(d){ return d.radius; });

            self.simulation.nodes(self.nodes);
        };
        BubbleChart.prototype.resize_vis = function(){
            var self = this;
            d3.select(self.containerid).select("svg").attr("width", self.width).attr("height", self.height);
            self.bubbles.transition().duration(200).attr("r", function(d){ return d.radius; });
        };
        BubbleChart.prototype.restart_vis = function(){
            var self = this;
            self.simulation
                .force('x', d3.forceX().strength(self.forceStrength).x(self.center.x))
                .force('y', d3.forceY().strength(self.forceStrength).y(self.center.y))
                .force('charge', d3.forceManyBody().strength(charge));
            function charge(d){
                return -Math.pow(d.radius, 2.02) * self.forceStrength;
            }
            self.simulation.alpha(1).restart();
        };
        BubbleChart.prototype.bind_resize = function(){
            var self = this;
            $(window).resize(function(){
                if (self.m_timer == null) {
                    self.m_timer = window.setTimeout(function () {
                        self.resize_nodes();
                        self.resize_vis();
                        self.restart_vis();
                        window.clearTimeout(self.m_timer);
                        self.m_timer = null;
                    }, 100);
                }
            });
        };
        BubbleChart.prototype.bubble_mouseover = function(d, i, element){
            d3.select(element).attr("stroke", (function(_this){
                return function(d){
                    return d3.rgb(_this.fill_color(d.group)).darker();
                };
            })(this));
            $('circle#' + d.id).tooltip({
                follow: true,
                tooltip: [
                    '<span class="value">' + d.projectcode + '. ' + d.projectname + '</span><br><br>',
                    '<span class="name">Всего контрактов: </span><span class="value">' + d.contractscount + '</span><br/>',
                    '<span class="name">На сумму: </span><span class="value">' + d.value + ' млн.руб.</span>'
                ].join('')
            }).tooltip('show', d3.event);
        };
        BubbleChart.prototype.bubble_mouseout = function(d, i, element){
            d3.select(element).attr("stroke", (function (_this) {
                return function (d) {
                    return d3.rgb(_this.fill_color(d.group)).darker(.25);
                };
            })(this));
            $('circle#' + d.id).tooltip('hide');
        };
        return BubbleChart;
    })();
}