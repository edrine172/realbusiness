from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('inventory', '0013_notification_is_active'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.AlterField(
            model_name='staffmember',
            name='pay_basis',
            field=models.CharField(choices=[('monthly', 'Monthly salary'), ('hourly', 'Hourly wage'), ('daily', 'Daily wage')], default='monthly', max_length=12),
        ),
        migrations.AlterField(
            model_name='payrollline',
            name='pay_basis',
            field=models.CharField(choices=[('monthly', 'Monthly salary'), ('hourly', 'Hourly wage'), ('daily', 'Daily wage')], max_length=12),
        ),
        migrations.AddField(
            model_name='payrollline',
            name='days_worked',
            field=models.PositiveIntegerField(default=0),
        ),
        migrations.CreateModel(
            name='StaffAttendance',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('date', models.DateField()),
                ('attended', models.BooleanField(default=False)),
                ('daily_wage', models.DecimalField(decimal_places=2, default=0, max_digits=12)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('recorded_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='staff_attendance_records', to=settings.AUTH_USER_MODEL)),
                ('worker', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='attendance_records', to='inventory.staffmember')),
            ],
            options={
                'ordering': ['date', 'worker__full_name'],
            },
        ),
        migrations.AddConstraint(
            model_name='staffattendance',
            constraint=models.UniqueConstraint(fields=('worker', 'date'), name='unique_staff_attendance_per_day'),
        ),
    ]