import 'package:flutter/material.dart';

class InsightsScreen extends StatelessWidget {
  const InsightsScreen({super.key, this.predictionId});
  final String? predictionId;
  @override
  Widget build(BuildContext context) => const Scaffold(body: Center(child: Text('Insights (todo)')));
}

class PredictionDetailsScreen extends StatelessWidget {
  const PredictionDetailsScreen({super.key, this.predictionId});
  final String? predictionId;
  @override
  Widget build(BuildContext context) => const Scaffold(body: Center(child: Text('Prediction (todo)')));
}

class SettingsScreen extends StatelessWidget {
  const SettingsScreen({super.key});
  @override
  Widget build(BuildContext context) => const Scaffold(body: Center(child: Text('Settings (todo)')));
}

class GreenMomentsScreen extends StatelessWidget {
  const GreenMomentsScreen({super.key});
  @override
  Widget build(BuildContext context) => const Scaffold(body: Center(child: Text('Green Moments (todo)')));
}
