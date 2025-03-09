const QuickChart = require('quickchart-js');
const logger = require('../utils/logger');

class ChartService {
    constructor() {
        this.chart = new QuickChart();
        this.setupDefaultConfig();
    }

    setupDefaultConfig() {
        this.chart.setWidth(800);
        this.chart.setHeight(400);
        this.chart.setBackgroundColor('white');
    }

    async createBarChart(data) {
        try {
            const chartData = this.prepareChartData(data);
            
            const config = {
                type: 'bar',
                data: {
                    labels: chartData.labels,
                    datasets: [{
                        label: 'Количество палок',
                        data: chartData.values,
                        backgroundColor: this.generateColors(chartData.labels.length),
                        borderColor: 'rgba(0, 0, 0, 0.3)',
                        borderWidth: 1
                    }]
                },
                options: {
                    responsive: true,
                    plugins: {
                        legend: {
                            display: false
                        },
                        title: {
                            display: true,
                            text: 'Статистика палочников',
                            font: {
                                size: 16
                            }
                        }
                    },
                    scales: {
                        y: {
                            beginAtZero: true,
                            border: {
                                display: true
                            },
                            grid: {
                                drawOnChartArea: false,
                                display: false
                            },
                            ticks: {
                                precision: 0,
                                stepSize: 1
                            }
                        },
                        x: {
                            border: {
                                display: true
                            },
                            grid: {
                                drawOnChartArea: false,
                                display: false
                            }
                        }
                    }
                }
            };

            this.chart.setConfig(config);
            return await this.chart.toBinary();
        } catch (error) {
            logger.error('Ошибка при создании диаграммы:', error);
            throw error;
        }
    }

    prepareChartData(data) {
        // Исключаем строки с правилами и пустые строки
        const filteredData = data
            .filter(item => {
                if (!item['Имя']) return false;
                
                const name = item['Имя'].toString().toLowerCase().trim();
                if (name === '') return false;
                
                // Исключаем строки, которые содержат цифры с точкой (правила)
                if (/^\d+\./.test(item['Имя'])) return false;
                
                // Исключаем строки с ключевыми словами правил
                const ruleKeywords = [
                    'правила',
                    'палку получает',
                    'при появлении',
                    'расчётное время',
                    'при спорных',
                    'если из за',
                    'оспорить'
                ];
                
                return !ruleKeywords.some(keyword => name.includes(keyword));
            })
            .map(item => ({
                ...item,
                'Кол-во палок': parseInt(item['Кол-во палок']) || 0 // Используем parseInt вместо Math.round
            }))
            .sort((a, b) => b['Кол-во палок'] - a['Кол-во палок']);

        return {
            labels: filteredData.map(item => item['Имя']),
            values: filteredData.map(item => item['Кол-во палок'])
        };
    }

    generateColors(count) {
        const baseColors = [
            'rgba(54, 162, 235, 0.7)',   // синий
            'rgba(255, 99, 132, 0.7)',   // розовый
            'rgba(75, 192, 192, 0.7)',   // бирюзовый
            'rgba(255, 159, 64, 0.7)',   // оранжевый
            'rgba(153, 102, 255, 0.7)',  // фиолетовый
            'rgba(255, 205, 86, 0.7)',   // желтый
            'rgba(201, 203, 207, 0.7)',  // серый
            'rgba(162, 235, 177, 0.7)',  // мятный
            'rgba(255, 99, 172, 0.7)',   // малиновый
            'rgba(75, 142, 192, 0.7)'    // темно-бирюзовый
        ];

        if (count <= baseColors.length) {
            return baseColors.slice(0, count);
        }

        const colors = [...baseColors];
        const goldenRatio = 0.618033988749895;
        let hue = Math.random();

        for (let i = baseColors.length; i < count; i++) {
            hue += goldenRatio;
            hue %= 1;
            colors.push(`hsla(${hue * 360}, 70%, 60%, 0.7)`);
        }

        return colors;
    }
}

module.exports = new ChartService(); 