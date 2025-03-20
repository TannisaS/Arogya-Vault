import {
  Appointment,
  HealthRecord,
  MedicalLeave,
  User,
} from "../models/index.js";
import { uploadDocument } from "../utils/cloudinary.js";
import fs from "fs";

export const updateTimeSlots = async (req, res) => {
  const doctorId = req.user.id;
  const newSlots = req.body.slots;
  try {
    // Update the doctor's available slots in the User model
    // Using proper MongoDB syntax for updating array fields
    await User.findByIdAndUpdate(
      doctorId,
      { $push: { availableSlots: { $each: newSlots } } },
      { new: true }
    );
    return res.status(200).json({ message: "Time slots updated successfully" });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

export const updateAppointmentStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body; // "confirmed" or "cancelled" or "pending" for rescheduling purposes

    if (!["confirmed", "cancelled", "pending"].includes(status)) {
      return res.status(400).json({ message: "Invalid status update." });
    }

    const appointment = await Appointment.findById(id);

    if (!appointment) {
      return res.status(404).json({ message: "Appointment not found." });
    }

    // Update appointment status
    appointment.status = status;
    await appointment.save();

    const { doctorId, slotDateTime } = appointment;

    // Handle slot booking status based on appointment status
    if (status === "confirmed") {
      // Mark slot as booked when appointment is confirmed
      const updatedDoctor = await User.findOneAndUpdate(
        {
          _id: doctorId,
          "availableSlots.dateTime": slotDateTime,
        },
        {
          $set: {
            "availableSlots.$.isBooked": true,
          },
        },
        { new: true }
      );

      if (!updatedDoctor) {
        console.log("Could not find matching slot for doctor when confirming");
      }
    } else if (status === "cancelled") {
      // Mark slot as available again when appointment is cancelled
      const updatedDoctor = await User.findOneAndUpdate(
        {
          _id: doctorId,
          "availableSlots.dateTime": slotDateTime,
        },
        {
          $set: {
            "availableSlots.$.isBooked": false,
          },
        },
        { new: true }
      );

      if (!updatedDoctor) {
        console.log("Could not find matching slot for doctor when cancelling");
      }
    }

    res.status(200).json({ message: `Appointment ${status} successfully.` });
  } catch (error) {
    console.error("Error updating appointment status:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

export const getDoctorAppointments = async (req, res) => {
  try {
    const doctorId = req.user.id;
    const { status } = req.query;

    const filter = { doctorId };
    if (status) {
      filter.status = status;
    }

    // First, fetch the doctor information to get their name
    const doctor = await User.findById(doctorId, "name");
    
    // Then fetch appointments and populate student info
    const appointments = await Appointment.find(filter).populate(
      "studentId",
      "name email"
    );

    // Add the doctor name to the response
    const appointmentsWithDoctorInfo = appointments.map(appointment => {
      const appointmentObj = appointment.toObject();
      appointmentObj.doctorName = doctor.name;
      return appointmentObj;
    });

    res.status(200).json(appointmentsWithDoctorInfo);
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

export const updatePrescription = async (req, res) => {
  try {
    const { appointmentId } = req.body;
    if (!appointmentId) {
      return res.status(400).json({ message: "Appointment ID is required." });
    }

    if (!req.file) {
      return res.status(400).json({ message: "No file uploaded." });
    }

    // Upload file to Cloudinary
    const uploadResult = await uploadDocument(req.file.path);

    // Update the appointment with the prescription URL
    const updatedAppointment = await Appointment.findByIdAndUpdate(
      appointmentId,
      { prescription: uploadResult.secure_url },
      { new: true }
    );

    if (!updatedAppointment) {
      return res.status(404).json({ message: "Appointment not found." });
    }

    // Remove file from local storage after upload
    fs.unlinkSync(req.file.path);

    res.status(200).json({
      message: "Prescription uploaded successfully.",
      appointment: updatedAppointment,
    });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};
